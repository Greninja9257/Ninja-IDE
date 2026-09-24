import * as tf from '@tensorflow/tfjs';

import ArgumentType from 'scratch-vm/src/extension-support/argument-type';
import BlockType from 'scratch-vm/src/extension-support/block-type';
import Cast from 'scratch-vm/src/util/cast';
import Video from 'scratch-vm/src/io/video';

const DEFAULT_HIDDEN_LAYERS = [{units: 16, activation: 'relu'}];
const IMAGE_SIZE = 224;
const VIDEO_DIMENSIONS = [480, 360];

const menuIconURI = `data:image/svg+xml;base64,${btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
    '<circle cx="20" cy="20" r="19" fill="#5c7cfa" stroke="#4263eb" stroke-width="2"/>' +
    '<g stroke="#fff" stroke-width="1.5" opacity=".8">' +
    '<path d="M11 13L20 11M11 13L20 20M11 13L20 29M11 27L20 11M11 27L20 20M11 27L20 29' +
    'M20 11L29 20M20 20L29 20M20 29L29 20"/></g>' +
    '<g fill="#fff"><circle cx="11" cy="13" r="3"/><circle cx="11" cy="27" r="3"/>' +
    '<circle cx="20" cy="11" r="3"/><circle cx="20" cy="20" r="3"/><circle cx="20" cy="29" r="3"/>' +
    '<circle cx="29" cy="20" r="3"/></g></svg>'
)}`;

/**
 * A small dense classifier: examples go in, a softmax over labels comes out.
 * Both the list network and the camera network are one of these; they differ
 * only in where their input vectors come from.
 */
class Classifier {
    constructor (layers) {
        this.layers = layers;
        this.examples = [];
        this.model = null;
        this.labels = [];
        this.mean = null;
        this.std = null;
        this.accuracy = 0;
        this.loss = 0;
        this.training = false;
    }

    addExample (values, label) {
        this.examples.push({values, label});
    }

    clearExamples () {
        this.examples = [];
    }

    dispose () {
        if (this.model) this.model.dispose();
        if (this.mean) tf.dispose([this.mean, this.std]);
        this.model = null;
        this.mean = null;
        this.std = null;
        this.labels = [];
        this.accuracy = 0;
        this.loss = 0;
    }

    async train (epochs, learningRate, normalize) {
        const size = this.examples.length ? this.examples[0].values.length : 0;
        const examples = this.examples.filter(example => example.values.length === size);
        const labels = [...new Set(examples.map(example => example.label))];
        if (!size || labels.length < 2 || this.training) return;

        this.dispose();
        this.training = true;
        this.labels = labels;
        const rawInputs = tf.tensor2d(examples.map(example => example.values));
        const outputs = tf.oneHot(
            tf.tensor1d(examples.map(example => labels.indexOf(example.label)), 'int32'),
            labels.length
        );
        if (normalize) {
            const moments = tf.moments(rawInputs, 0);
            this.mean = moments.mean;
            this.std = tf.tidy(() => tf.sqrt(moments.variance).add(1e-6));
        }
        const inputs = this.normalize(rawInputs);

        this.model = tf.sequential();
        this.layers.forEach((layer, index) => {
            this.model.add(tf.layers.dense({
                ...(index === 0 ? {inputShape: [size]} : {}),
                units: layer.units,
                activation: layer.activation
            }));
        });
        this.model.add(tf.layers.dense({
            ...(this.layers.length ? {} : {inputShape: [size]}),
            units: labels.length,
            activation: 'softmax'
        }));
        this.model.compile({
            optimizer: tf.train.adam(learningRate),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });

        try {
            const history = await this.model.fit(inputs, outputs, {
                epochs,
                batchSize: Math.min(32, examples.length),
                shuffle: true,
                yieldEvery: 'epoch'
            });
            const losses = history.history.loss;
            const accuracies = history.history.acc || history.history.accuracy;
            this.loss = losses[losses.length - 1];
            this.accuracy = accuracies[accuracies.length - 1] * 100;
        } finally {
            this.training = false;
            tf.dispose([rawInputs, inputs, outputs]);
        }
    }

    normalize (inputs) {
        if (!this.mean) return inputs.clone();
        return tf.tidy(() => inputs.sub(this.mean).div(this.std));
    }

    predict (values) {
        if (!this.model || values.length !== this.model.inputs[0].shape[1]) return null;
        const scores = tf.tidy(() => {
            const input = this.normalize(tf.tensor2d([values]));
            return this.model.predict(input).dataSync();
        });
        return this.labels.reduce((result, label, index) => {
            result[label] = scores[index];
            return result;
        }, {});
    }
}

const bestLabel = scores => {
    if (!scores) return '';
    return Object.keys(scores).reduce((best, label) => (scores[label] > scores[best] ? label : best));
};

class Scratch3NeuralNetworks {
    constructor (runtime) {
        this.runtime = runtime;
        this.featureModel = null;
        this.featureModelPromise = null;
        this.reset();
        this.runtime.on('PROJECT_LOADED', () => this.reset());
    }

    getInfo () {
        return {
            id: 'neuralnetworks',
            name: 'Neural Networks',
            color1: '#5c7cfa',
            color2: '#4c6ef5',
            color3: '#4263eb',
            menuIconURI,
            blocks: [
                {
                    opcode: 'createNetwork',
                    blockType: BlockType.COMMAND,
                    text: 'create neural network'
                },
                {
                    opcode: 'addLayer',
                    blockType: BlockType.COMMAND,
                    text: 'add layer of [UNITS] neurons with [ACTIVATION] activation',
                    arguments: {
                        UNITS: {type: ArgumentType.NUMBER, defaultValue: 16},
                        ACTIVATION: {type: ArgumentType.STRING, menu: 'activation', defaultValue: 'relu'}
                    }
                },
                {
                    opcode: 'setLearningRate',
                    blockType: BlockType.COMMAND,
                    text: 'set learning rate to [RATE]',
                    arguments: {
                        RATE: {type: ArgumentType.NUMBER, defaultValue: 0.01}
                    }
                },
                '---',
                {
                    opcode: 'addExample',
                    blockType: BlockType.COMMAND,
                    text: 'add example [LIST] labelled [LABEL]',
                    arguments: {
                        LIST: {type: ArgumentType.STRING, menu: 'lists'},
                        LABEL: {type: ArgumentType.STRING, defaultValue: 'A'}
                    }
                },
                {
                    opcode: 'clearExamples',
                    blockType: BlockType.COMMAND,
                    text: 'clear examples'
                },
                {
                    opcode: 'getExampleCount',
                    blockType: BlockType.REPORTER,
                    text: 'number of examples'
                },
                '---',
                {
                    opcode: 'train',
                    blockType: BlockType.COMMAND,
                    text: 'train for [EPOCHS] epochs',
                    arguments: {
                        EPOCHS: {type: ArgumentType.NUMBER, defaultValue: 50}
                    }
                },
                {
                    opcode: 'isTrained',
                    blockType: BlockType.BOOLEAN,
                    text: 'trained?'
                },
                {
                    opcode: 'getAccuracy',
                    blockType: BlockType.REPORTER,
                    text: 'accuracy'
                },
                {
                    opcode: 'getLoss',
                    blockType: BlockType.REPORTER,
                    text: 'loss'
                },
                '---',
                {
                    opcode: 'predict',
                    blockType: BlockType.REPORTER,
                    text: 'predict [LIST]',
                    arguments: {
                        LIST: {type: ArgumentType.STRING, menu: 'lists'}
                    }
                },
                {
                    opcode: 'getConfidence',
                    blockType: BlockType.REPORTER,
                    text: 'confidence of [LABEL] for [LIST]',
                    arguments: {
                        LABEL: {type: ArgumentType.STRING, defaultValue: 'A'},
                        LIST: {type: ArgumentType.STRING, menu: 'lists'}
                    }
                },
                '---',
                {
                    opcode: 'setVideo',
                    blockType: BlockType.COMMAND,
                    text: 'turn camera [STATE]',
                    arguments: {
                        STATE: {type: ArgumentType.STRING, menu: 'videoState', defaultValue: 'on'}
                    }
                },
                {
                    opcode: 'addCameraExample',
                    blockType: BlockType.COMMAND,
                    text: 'add camera example labelled [LABEL]',
                    arguments: {
                        LABEL: {type: ArgumentType.STRING, defaultValue: 'A'}
                    }
                },
                {
                    opcode: 'clearCameraExamples',
                    blockType: BlockType.COMMAND,
                    text: 'clear camera examples'
                },
                {
                    opcode: 'getCameraExampleCount',
                    blockType: BlockType.REPORTER,
                    text: 'number of camera examples'
                },
                {
                    opcode: 'trainCamera',
                    blockType: BlockType.COMMAND,
                    text: 'train camera for [EPOCHS] epochs',
                    arguments: {
                        EPOCHS: {type: ArgumentType.NUMBER, defaultValue: 20}
                    }
                },
                {
                    opcode: 'classifyCamera',
                    blockType: BlockType.REPORTER,
                    text: 'camera label'
                },
                {
                    opcode: 'getCameraConfidence',
                    blockType: BlockType.REPORTER,
                    text: 'camera confidence of [LABEL]',
                    arguments: {
                        LABEL: {type: ArgumentType.STRING, defaultValue: 'A'}
                    }
                }
            ],
            menus: {
                activation: {
                    acceptReporters: false,
                    items: ['relu', 'sigmoid', 'tanh', 'linear']
                },
                lists: {
                    acceptReporters: false,
                    items: 'getListMenu'
                },
                videoState: {
                    acceptReporters: false,
                    items: ['on', 'on flipped', 'off']
                }
            }
        };
    }

    getListMenu () {
        const names = new Set();
        const addLists = target => {
            if (!target) return;
            Object.values(target.variables)
                .filter(variable => variable.type === 'list')
                .forEach(variable => names.add(variable.name));
        };
        addLists(this.runtime.getEditingTarget());
        addLists(this.runtime.getTargetForStage());
        return names.size ? [...names].sort() : [''];
    }

    reset () {
        if (this.network) this.network.dispose();
        if (this.cameraNetwork) this.cameraNetwork.dispose();
        this.layers = [];
        this.learningRate = 0.01;
        this.network = new Classifier(DEFAULT_HIDDEN_LAYERS);
        this.cameraNetwork = new Classifier([{units: 64, activation: 'relu'}]);
    }

    readList (name, util) {
        const list = util.target.lookupVariableByNameAndType(Cast.toString(name), 'list');
        if (!list) return null;
        return list.value.map(item => Cast.toNumber(item));
    }

    createNetwork () {
        const examples = this.network.examples;
        this.network.dispose();
        this.layers = [];
        this.network = new Classifier(DEFAULT_HIDDEN_LAYERS);
        this.network.examples = examples;
    }

    addLayer (args) {
        const units = Math.max(1, Math.min(1024, Math.round(Cast.toNumber(args.UNITS))));
        const activation = ['relu', 'sigmoid', 'tanh', 'linear'].includes(args.ACTIVATION) ?
            args.ACTIVATION : 'relu';
        this.layers.push({units, activation});
        this.network.layers = this.layers;
    }

    setLearningRate (args) {
        this.learningRate = Math.max(0.00001, Math.min(1, Cast.toNumber(args.RATE)));
    }

    addExample (args, util) {
        const values = this.readList(args.LIST, util);
        if (values && values.length) this.network.addExample(values, Cast.toString(args.LABEL));
    }

    clearExamples () {
        this.network.clearExamples();
    }

    getExampleCount () {
        return this.network.examples.length;
    }

    train (args) {
        const epochs = Math.max(1, Math.min(1000, Math.round(Cast.toNumber(args.EPOCHS))));
        return this.network.train(epochs, this.learningRate, true);
    }

    isTrained () {
        return Boolean(this.network.model);
    }

    getAccuracy () {
        return Math.round(this.network.accuracy * 100) / 100;
    }

    getLoss () {
        return Math.round(this.network.loss * 10000) / 10000;
    }

    predict (args, util) {
        const values = this.readList(args.LIST, util);
        return values ? bestLabel(this.network.predict(values)) : '';
    }

    getConfidence (args, util) {
        const values = this.readList(args.LIST, util);
        const scores = values && this.network.predict(values);
        const score = scores && scores[Cast.toString(args.LABEL)];
        return score ? Math.round(score * 1000) / 10 : 0;
    }

    setVideo (args) {
        const video = this.runtime.ioDevices.video;
        const state = Cast.toString(args.STATE);
        if (state === 'off') {
            video.disableVideo();
            return;
        }
        video.mirror = state !== 'on flipped';
        return video.enableVideo();
    }

    getFeatureModel () {
        if (!this.featureModelPromise) {
            const modelURL = new URL(
                `${process.env.ROOT}ninja-extensions/models/mobilenet/model.json`,
                location.href
            ).href;
            this.featureModelPromise = tf.loadLayersModel(modelURL)
                .then(model => {
                    this.featureModel = model;
                    return model;
                })
                .catch(error => {
                    this.featureModelPromise = null;
                    throw error;
                });
        }
        return this.featureModelPromise;
    }

    async getCameraFeatures () {
        const frame = this.runtime.ioDevices.video.getFrame({
            format: Video.FORMAT_CANVAS,
            dimensions: VIDEO_DIMENSIONS
        });
        if (!frame) return null;
        const model = await this.getFeatureModel();
        return tf.tidy(() => {
            const pixels = tf.browser.fromPixels(frame);
            const [height, width] = pixels.shape;
            const side = Math.min(width, height);
            const square = pixels.slice(
                [Math.floor((height - side) / 2), Math.floor((width - side) / 2), 0],
                [side, side, 3]
            );
            const input = tf.image.resizeBilinear(square, [IMAGE_SIZE, IMAGE_SIZE])
                .toFloat()
                .div(127.5)
                .sub(1)
                .expandDims(0);
            return Array.from(model.predict(input).mean([1, 2])
                .dataSync());
        });
    }

    async addCameraExample (args) {
        const features = await this.getCameraFeatures();
        if (features) this.cameraNetwork.addExample(features, Cast.toString(args.LABEL));
    }

    clearCameraExamples () {
        this.cameraNetwork.clearExamples();
    }

    getCameraExampleCount () {
        return this.cameraNetwork.examples.length;
    }

    trainCamera (args) {
        const epochs = Math.max(1, Math.min(1000, Math.round(Cast.toNumber(args.EPOCHS))));
        return this.cameraNetwork.train(epochs, 0.001, false);
    }

    async getCameraScores () {
        if (!this.cameraNetwork.model) return null;
        const features = await this.getCameraFeatures();
        return features && this.cameraNetwork.predict(features);
    }

    async classifyCamera () {
        return bestLabel(await this.getCameraScores());
    }

    async getCameraConfidence (args) {
        const scores = await this.getCameraScores();
        const score = scores && scores[Cast.toString(args.LABEL)];
        return score ? Math.round(score * 1000) / 10 : 0;
    }
}

export default Scratch3NeuralNetworks;
