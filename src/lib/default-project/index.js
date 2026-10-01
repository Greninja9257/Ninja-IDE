import projectData from './project-data';

/* eslint-disable import/no-unresolved */
import overrideDefaultProject from '!arraybuffer-loader!./override-default-project.sb3';
import backdrop from '!raw-loader!./cd21514d0531fdffb22204e0ec5ed84a.svg';
import costume1 from '!arraybuffer-loader!./ninja-costume.png';
/* eslint-enable import/no-unresolved */
import {TextEncoder} from '../tw-text-encoder';

// A 46-byte WAV: 22050 Hz, 16-bit mono, one sample of silence.
const SILENCE = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x26, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
    0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x22, 0x56, 0x00, 0x00, 0x44, 0xac, 0x00, 0x00,
    0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00
]);

const defaultProject = translator => {
    if (overrideDefaultProject.byteLength > 0) {
        return [{
            id: 0,
            assetType: 'Project',
            dataFormat: 'JSON',
            data: overrideDefaultProject
        }];
    }

    let _TextEncoder;
    if (typeof TextEncoder === 'undefined') {
        _TextEncoder = require('text-encoding').TextEncoder;
    } else {
        _TextEncoder = TextEncoder;
    }
    const encoder = new _TextEncoder();

    const projectJson = projectData(translator);
    return [{
        id: 0,
        assetType: 'Project',
        dataFormat: 'JSON',
        data: JSON.stringify(projectJson)
    }, {
        id: 'cd21514d0531fdffb22204e0ec5ed84a',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(backdrop)
    }, {
        // The Ninja "N" (the site favicon, sized for the stage).
        id: '6495a1854eca6ab107e4949c429d8b79',
        assetType: 'ImageBitmap',
        dataFormat: 'PNG',
        data: new Uint8Array(costume1)
    }, {
        // sound1: one sample of silence (scratch-storage's default sound).
        id: 'b586745b98e94d7574f7f7b48d831e20',
        assetType: 'Sound',
        dataFormat: 'WAV',
        data: SILENCE
    }];
};

export default defaultProject;
