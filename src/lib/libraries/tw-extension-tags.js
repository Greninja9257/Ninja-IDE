import {defineMessages} from 'react-intl';

const messages = defineMessages({
    graphics: {
        defaultMessage: 'Graphics',
        description: 'Tag for filtering the extension library to graphics extensions',
        id: 'ninja.extensionTags.graphics'
    },
    sound: {
        defaultMessage: 'Sound',
        description: 'Tag for filtering the extension library to sound extensions',
        id: 'ninja.extensionTags.sound'
    },
    data: {
        defaultMessage: 'Data',
        description: 'Tag for filtering the extension library to data extensions',
        id: 'ninja.extensionTags.data'
    },
    input: {
        defaultMessage: 'Input',
        description: 'Tag for filtering the extension library to input and hardware extensions',
        id: 'ninja.extensionTags.input'
    },
    network: {
        defaultMessage: 'Network',
        description: 'Tag for filtering the extension library to network extensions',
        id: 'ninja.extensionTags.network'
    },
    utility: {
        defaultMessage: 'Utility',
        description: 'Tag for filtering the extension library to utility extensions',
        id: 'ninja.extensionTags.utility'
    },
    niche: {
        defaultMessage: 'Niche',
        description: 'Tag for filtering the extension library to rarely useful extensions',
        id: 'ninja.extensionTags.niche'
    }
});

export default Object.keys(messages).map(tag => ({tag, intlLabel: messages[tag]}));
