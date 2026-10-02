import {defineMessages} from 'react-intl';
import sharedMessages from '../shared-messages';

let messages = defineMessages({
    variable: {
        defaultMessage: 'my variable',
        description: 'Name for the default variable',
        id: 'gui.defaultProject.variable'
    }
});

messages = {...messages, ...sharedMessages};

// use the default message if a translation function is not passed
const defaultTranslator = msgObj => msgObj.defaultMessage;

/**
 * Generate a localized version of the default project
 * @param {function} translateFunction a function to use for translating the default names
 * @return {object} the project data json for the default project
 */
const projectData = translateFunction => {
    const translator = translateFunction || defaultTranslator;
    return ({
        targets: [
            {
                isStage: true,
                name: 'Stage',
                variables: {
                    '`jEk@4|i[#Fk?(8x)AV.-my variable': [
                        translator(messages.variable),
                        0
                    ]
                },
                lists: {},
                broadcasts: {},
                blocks: {},
                currentCostume: 0,
                costumes: [
                    {
                        assetId: 'cd21514d0531fdffb22204e0ec5ed84a',
                        name: translator(messages.backdrop, {index: 1}),
                        md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg',
                        dataFormat: 'svg',
                        rotationCenterX: 240,
                        rotationCenterY: 180
                    }
                ],
                sounds: [
                    // A blank sound1, like the blank costume1 (one sample of silence).
                    {
                        assetId: 'b586745b98e94d7574f7f7b48d831e20',
                        name: translator(messages.sound, {index: 1}),
                        dataFormat: 'wav',
                        format: '',
                        rate: 22050,
                        sampleCount: 1,
                        md5ext: 'b586745b98e94d7574f7f7b48d831e20.wav'
                    }
                ],
                volume: 100
            },
            {
                isStage: false,
                name: translator(messages.sprite, {index: 1}),
                variables: {},
                lists: {},
                broadcasts: {},
                blocks: {},
                comments: {},
                currentCostume: 0,
                costumes: [
                    {
                        // The Ninja mascot, like Scratch's cat.
                        assetId: '466526d69de9305d3418eed6c1fd83e7',
                        name: translator(messages.costume, {index: 1}),
                        bitmapResolution: 1,
                        md5ext: '466526d69de9305d3418eed6c1fd83e7.svg',
                        dataFormat: 'svg',
                        // The middle of the body (head and legs line up on x = 65.95), not
                        // of the picture: the headband's tails stick out to the left.
                        rotationCenterX: 65.95,
                        rotationCenterY: 100.59444
                    }
                ],
                sounds: [
                    // A blank sound1, like the blank costume1 (one sample of silence).
                    {
                        assetId: 'b586745b98e94d7574f7f7b48d831e20',
                        name: translator(messages.sound, {index: 1}),
                        dataFormat: 'wav',
                        format: '',
                        rate: 22050,
                        sampleCount: 1,
                        md5ext: 'b586745b98e94d7574f7f7b48d831e20.wav'
                    }
                ],
                volume: 100,
                visible: true,
                x: 0,
                y: 0,
                size: 100,
                direction: 90,
                draggable: false,
                rotationStyle: 'all around'
            }
        ],
        meta: {
            semver: '3.0.0',
            vm: '0.1.0',
            agent: ''
        }
    });
};


export default projectData;
