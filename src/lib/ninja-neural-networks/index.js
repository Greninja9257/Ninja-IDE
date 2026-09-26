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

// Training runs in slices this long (ms), handing back to the project in
// between, so scripts and the stage keep going while a network learns.
const TRAIN_SLICE_MS = 8;
// Camera features are worked out at most this often (ms), shared by every
// block that asks in between.
const CAMERA_FRAME_MS = 1000 / 30;

const yieldToProject = () => new Promise(resolve => setTimeout(resolve, 0));

const ACTIVATIONS = {
    relu: [z => (z > 0 ? z : 0), z => (z > 0 ? 1 : 0)],
    sigmoid: [z => 1 / (1 + Math.exp(-z)), (z, a) => a * (1 - a)],
    tanh: [z => Math.tanh(z), (z, a) => 1 - (a * a)],
    linear: [z => z, () => 1]
};

/**
 * A small dense classifier: examples go in, a softmax over labels comes out.
 * Both the list network and the camera network are one of these; they differ
 * only in where their input vectors come from.
 *
 * These networks are tiny, so they run in plain JavaScript rather than
 * TensorFlow: a GPU round trip for each prediction costs far more than the
 * arithmetic. Same design as a TensorFlow dense network trained the usual
 * way: Glorot-uniform weights, zero biases, softmax cross-entropy, Adam.
 */
class Classifier {
    constructor (layers) {
        this.layers = layers;
        this.examples = [];
        this.net = null; // trained layers: {inSize, outSize, W, b, activation}
        this.labels = [];
        this.mean = null;
        this.std = null;
        this.accuracy = 0;
        this.loss = 0;
        this.training = false;
        this.cacheKey = null;
        this.cacheScores = null;
    }

    get trained () {
        return Boolean(this.net);
    }

    get inputSize () {
        return this.net ? this.net[0].inSize : 0;
    }

    addExample (values, label) {
        this.examples.push({values, label});
    }

    clearExamples () {
        this.examples = [];
    }

    dispose () {
        this.net = null;
        this.mean = null;
        this.std = null;
        this.labels = [];
        this.accuracy = 0;
        this.loss = 0;
        this.cacheKey = null;
        this.cacheScores = null;
    }

    static buildLayers (sizes, activations) {
        const layers = [];
        for (let l = 0; l < sizes.length - 1; l++) {
            const inSize = sizes[l];
            const outSize = sizes[l + 1];
            const limit = Math.sqrt(6 / (inSize + outSize));
            const W = new Float32Array(inSize * outSize);
            for (let i = 0; i < W.length; i++) W[i] = ((Math.random() * 2) - 1) * limit;
            layers.push({
                inSize,
                outSize,
                W,
                b: new Float32Array(outSize),
                activation: activations[l],
                // Adam state and gradients.
                mW: new Float32Array(W.length),
                vW: new Float32Array(W.length),
                mb: new Float32Array(outSize),
                vb: new Float32Array(outSize),
                gW: new Float32Array(W.length),
                gb: new Float32Array(outSize)
            });
        }
        return layers;
    }

    // Runs one input through; returns each layer's pre-activation and output
    // (the last output is the softmax).
    static forward (net, input) {
        const zs = [];
        const outs = [input];
        let a = input;
        for (let l = 0; l < net.length; l++) {
            const layer = net[l];
            const {inSize, outSize, W, b} = layer;
            const z = new Float32Array(outSize);
            for (let j = 0; j < outSize; j++) z[j] = b[j];
            for (let i = 0; i < inSize; i++) {
                const ai = a[i];
                if (ai === 0) continue;
                const row = i * outSize;
                for (let j = 0; j < outSize; j++) z[j] += ai * W[row + j];
            }
            const out = new Float32Array(outSize);
            if (l === net.length - 1) {
                let max = -Infinity;
                for (let j = 0; j < outSize; j++) max = Math.max(max, z[j]);
                let sum = 0;
                for (let j = 0; j < outSize; j++) {
                    out[j] = Math.exp(z[j] - max);
                    sum += out[j];
                }
                for (let j = 0; j < outSize; j++) out[j] /= sum;
            } else {
                const f = ACTIVATIONS[layer.activation][0];
                for (let j = 0; j < outSize; j++) out[j] = f(z[j]);
            }
            zs.push(z);
            outs.push(out);
            a = out;
        }
        return {zs, outs};
    }

    normalized (values, mean, std) {
        const out = new Float32Array(values.length);
        for (let i = 0; i < values.length; i++) {
            out[i] = mean ? (values[i] - mean[i]) / std[i] : values[i];
        }
        return out;
    }

    async train (epochs, learningRate, normalize) {
        const size = this.examples.length ? this.examples[0].values.length : 0;
        const examples = this.examples.filter(example => example.values.length === size);
        const labels = [...new Set(examples.map(example => example.label))];
        if (!size || labels.length < 2 || this.training) return;
        this.training = true;

        try {
            // Feature scaling from the examples.
            let mean = null;
            let std = null;
            if (normalize) {
                mean = new Float32Array(size);
                std = new Float32Array(size);
                for (const example of examples) {
                    for (let i = 0; i < size; i++) mean[i] += example.values[i];
                }
                for (let i = 0; i < size; i++) mean[i] /= examples.length;
                for (const example of examples) {
                    for (let i = 0; i < size; i++) std[i] += (example.values[i] - mean[i]) ** 2;
                }
                for (let i = 0; i < size; i++) std[i] = Math.sqrt(std[i] / examples.length) + 1e-6;
            }
            const inputs = examples.map(example => this.normalized(example.values, mean, std));
            const targets = examples.map(example => labels.indexOf(example.label));

            const sizes = [size, ...this.layers.map(layer => layer.units), labels.length];
            const activations = [...this.layers.map(layer => layer.activation), 'softmax'];
            const net = Classifier.buildLayers(sizes, activations);

            const batchSize = Math.min(32, examples.length);
            const order = examples.map((example, index) => index);
            const beta1 = 0.9;
            const beta2 = 0.999;
            const epsilon = 1e-7;
            let step = 0;
            let sliceStart = performance.now();
            let epochLoss = 0;
            let epochCorrect = 0;

            for (let epoch = 0; epoch < epochs; epoch++) {
                // Shuffle each epoch.
                for (let i = order.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [order[i], order[j]] = [order[j], order[i]];
                }
                epochLoss = 0;
                epochCorrect = 0;
                for (let start = 0; start < order.length; start += batchSize) {
                    const batch = order.slice(start, start + batchSize);
                    for (const layer of net) {
                        layer.gW.fill(0);
                        layer.gb.fill(0);
                    }
                    for (const index of batch) {
                        const {zs, outs} = Classifier.forward(net, inputs[index]);
                        const probs = outs[outs.length - 1];
                        const target = targets[index];
                        epochLoss -= Math.log(probs[target] + 1e-7);
                        let best = 0;
                        for (let j = 1; j < probs.length; j++) if (probs[j] > probs[best]) best = j;
                        if (best === target) epochCorrect++;
                        // Softmax + cross-entropy: the error is just p - y.
                        let delta = Float32Array.from(probs);
                        delta[target] -= 1;
                        for (let l = net.length - 1; l >= 0; l--) {
                            const layer = net[l];
                            const {inSize, outSize, W} = layer;
                            const aPrev = outs[l];
                            for (let i = 0; i < inSize; i++) {
                                const ai = aPrev[i];
                                if (ai === 0) continue;
                                const row = i * outSize;
                                for (let j = 0; j < outSize; j++) layer.gW[row + j] += ai * delta[j];
                            }
                            for (let j = 0; j < outSize; j++) layer.gb[j] += delta[j];
                            if (l === 0) break;
                            const below = net[l - 1];
                            const derivative = ACTIVATIONS[below.activation][1];
                            const zPrev = zs[l - 1];
                            const next = new Float32Array(inSize);
                            for (let i = 0; i < inSize; i++) {
                                let sum = 0;
                                const row = i * outSize;
                                for (let j = 0; j < outSize; j++) sum += W[row + j] * delta[j];
                                next[i] = sum * derivative(zPrev[i], aPrev[i]);
                            }
                            delta = next;
                        }
                    }
                    // Adam step on the batch's mean gradient.
                    step++;
                    const scale = 1 / batch.length;
                    const correction1 = 1 - (beta1 ** step);
                    const correction2 = 1 - (beta2 ** step);
                    const adam = (param, grad, m, v) => {
                        for (let i = 0; i < param.length; i++) {
                            const g = grad[i] * scale;
                            m[i] = (beta1 * m[i]) + ((1 - beta1) * g);
                            v[i] = (beta2 * v[i]) + ((1 - beta2) * g * g);
                            param[i] -= learningRate * (m[i] / correction1) / (Math.sqrt(v[i] / correction2) + epsilon);
                        }
                    };
                    for (const layer of net) {
                        adam(layer.W, layer.gW, layer.mW, layer.vW);
                        adam(layer.b, layer.gb, layer.mb, layer.vb);
                    }
                    if (performance.now() - sliceStart > TRAIN_SLICE_MS) {
                        await yieldToProject();
                        sliceStart = performance.now();
                    }
                }
            }

            // Swap in the new network; until now the old one kept answering.
            this.net = net.map(({inSize, outSize, W, b, activation}) => ({inSize, outSize, W, b, activation}));
            this.labels = labels;
            this.mean = mean;
            this.std = std;
            this.loss = epochLoss / examples.length;
            this.accuracy = (epochCorrect / examples.length) * 100;
            this.cacheKey = null;
            this.cacheScores = null;
        } finally {
            this.training = false;
        }
    }

    predict (values) {
        if (!this.net || values.length !== this.inputSize) return null;
        // Scripts often ask for the label and several confidences of the same
        // input in a row.
        const key = values.join(',');
        if (key === this.cacheKey) return this.cacheScores;
        const {outs} = Classifier.forward(this.net, this.normalized(values, this.mean, this.std));
        const probs = outs[outs.length - 1];
        const scores = {};
        this.labels.forEach((label, index) => {
            scores[label] = probs[index];
        });
        this.cacheKey = key;
        this.cacheScores = scores;
        return scores;
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
        this.cameraFeatures = null;
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
        return this.network.trained;
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
                .then(async model => {
                    // The first run compiles the GPU shaders; do it now rather
                    // than on the first camera block.
                    const warm = tf.tidy(() => model.predict(tf.zeros([1, IMAGE_SIZE, IMAGE_SIZE, 3])));
                    await warm.data();
                    warm.dispose();
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

    // One camera frame's features, shared by every block asking within the
    // same frame (the label and each confidence), so MobileNet runs at most
    // once per frame.
    getCameraFeatures () {
        const now = performance.now();
        if (this.cameraFeatures && now - this.cameraFeatures.time < CAMERA_FRAME_MS) {
            return this.cameraFeatures.promise;
        }
        const promise = this.computeCameraFeatures();
        this.cameraFeatures = {time: now, promise};
        return promise;
    }

    async computeCameraFeatures () {
        const frame = this.runtime.ioDevices.video.getFrame({
            format: Video.FORMAT_CANVAS,
            dimensions: VIDEO_DIMENSIONS
        });
        if (!frame) return null;
        const model = await this.getFeatureModel();
        // Read the result back without stalling the page on the GPU.
        const features = tf.tidy(() => {
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
            return model.predict(input).mean([1, 2]);
        });
        try {
            return Array.from(await features.data());
        } finally {
            features.dispose();
        }
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
        if (!this.cameraNetwork.trained) return null;
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
