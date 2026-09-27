import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const TW_ROOT = 'https://extensions.turbowarp.org/';
const SP_ROOT = 'https://sharkpools-extensions.vercel.app/';
const PM_ROOT = 'https://extensions.penguinmod.com/';
const PM_LIST = 'https://raw.githubusercontent.com/PenguinMod/PenguinMod-ExtensionsGallery/main/src/lib/extensions.js';
// Ninja's own extensions, kept in the repo rather than downloaded.
const OWN = path.resolve('extensions');
const OUTPUT = path.resolve('static/ninja-extensions');
const MANIFEST = path.resolve('src/lib/generated/ninja-extension-catalog.json');
const MOBILENET_ROOT = 'https://storage.googleapis.com/teachable-machine-models/' +
    'mobilenet_v2_weights_tf_dim_ordering_tf_kernels_0.35_224_no_top/';

// Extensions left out of Ninja: ones their authors mark as old, deprecated or
// replaced, and SharkPool copies of extensions the TurboWarp gallery already has.
const EXCLUDED = {
    TurboWarp: [
        'betterpen', // Pen Plus V5, replaced by Pen Plus V7
        'DTcameracontrols', // Camera V1, replaced by Camera V2
        'cs2627883NumericalEncoding', // Numerical Encoding V1, replaced by V2
        'nexuskittensgrab' // S-Grab (Scratch API): replaced by Ninja API
    ],
    SharkPool: [
        'Better-Input', // replaced by Popup-Phoenix
        'Keys-Plus-V2', // no longer maintained
        'Geometry-Dash-API', // deprecated upstream
        'Tune-Shark', // replaced by Tune Shark V3
        'Tune-Shark-V3', // TurboWarp: Tune Shark V3
        'Messages-Plus', // TurboWarp: Messages+
        'Camera', // TurboWarp: Camera V2
        'Font-Manager', // TurboWarp: Font Manager
        'Temporary-Variables', // TurboWarp: Temporary Variables
        'Gamepad-Expanded', // same extension ID as TurboWarp: Gamepad
        'Geolocation', // TurboWarp: Geolocation
        'Scratch-Utilities' // Scratch API: replaced by Ninja API
    ]
};

// PenguinMod's gallery is mostly PenguinMod-only extensions (custom block
// shapes and types, its compiler and serializer APIs, its accounts) and
// copies of TurboWarp and SharkPool ones, so only these are taken: each
// loads and renders every block in Ninja and does something Ninja doesn't
// already have.
const PENGUINMOD = {
    'Gen1x/iris-text.js': {}, // rich, per-character text engine
    'Gen1x/lighting.js': {}, // WebGL lighting
    'TheShovel/qoan-renderer.js': {}, // MotionSprite animation system
    'Gen1x/beat_sync.js': {}, // sync to a musical beat
    'Gen1x/storage_plus.js': {}, // local and server storage
    'ObviousAlexC/3DMath.js': {}, // 3D projection maths
    'pooiod/Dictation.js': {}, // speech to text
    'TheShovel/doodlerec.js': {}, // doodle recognition
    'MikeDev101/e2ee.js': {}, // end-to-end encryption
    'MikeDev101/webrtc.js': {}, // peer-to-peer connections
    'qxsck/big-decimal.js': {}, // arbitrary-precision decimals (BigInt has no decimals)
    'Gen1x/random_utils.js': {}, // UUIDs, random strings, true randomness
    'MubiLop/toastnotifs.js': {}, // in-page toasts (Notifications is the browser's)
    'LordCat0/ProjectInterfaces.js': {}, // GUI windows and controls
    'justablock/gitpenguin.js': {name: 'GitHub Files'}, // GitHub repository files
    'RubyDevs/turboweather.js': {}, // weather
    'NamelessCat/corsproxy.js': {description: 'Accessible CORS proxies for fetching information with Ninja.'},
    'Embin/embintranslation.js': {}, // translation keys for multi-language projects
    'TheShovel/extexp.js': {}, // call other extensions' functions
    'Ashime/MoreFields.js': {}, // extra field types
    'DogeisCut/BeepBoxPlayer.js': {}, // BeepBox songs
    'gaimerI17/DeviceMotion.js': {}, // accelerometer and gyroscope
    'pooiod/VideoSharing.js': {}, // screen and camera sharing
    'pooiod/WindowHasher.js': {}, // URL hash (Search Params covers the query)
    'pooiod/Scratchblocks.js': {}, // render blocks from text
    'DogeisCut/Resolution.js': {}, // dynamic resolution (Screen Resolution only reads the screen)
    'gaimerI17/crypto.js': {}, // hashing and encryption
    'bop_tw/Twitch.js': {description: 'Communicate with your Twitch chat on Ninja! Ninja is not affiliated with Twitch.'},
    'Gen1x/chess-ext.js': {}, // chess boards and engines
    'NishiOwO/ode.js': {}, // 3D physics
    'NishiOwO/libxmp.js': {}, // tracker music
    'TheShovel/shoveldebugger.js': {} // debugger
};

// Fixes to upstream code, applied after each download: [find, replace].
const PATCHES = {
    'SharkPool:My-Blocks-Plus': [[
        // Its storage is only saved when its blocks are used, so loading a
        // project without it (a collaborator's live copy, say) threw here.
        'imgStorage = runtime.extensionStorage["SPmbpCST"].imgStorage ?? {};',
        'imgStorage = runtime.extensionStorage["SPmbpCST"]?.imgStorage ?? {};'
    ]]
};

const applyPatches = async (key, asset) => {
    const patches = PATCHES[key];
    if (!patches) return asset;
    const file = path.join(OUTPUT, asset.path.replace(/^ninja-extensions\//, ''));
    let source = await fs.readFile(file, 'utf8');
    for (const [find, replace] of patches) {
        if (!source.includes(find)) {
            console.warn(`Patch for ${key} no longer applies: ${find}`);
            continue;
        }
        source = source.replace(find, replace);
    }
    const bytes = Buffer.from(source);
    await fs.writeFile(file, bytes);
    return {...asset, sha256: hash(bytes), bytes: bytes.length};
};

// Header comments of an extension in extensions/: "// Name: ...", etc.
const readHeader = source => Object.fromEntries([...source.matchAll(/^\/\/ *([A-Za-z]+): *(.*)$/gm)]
    .map(([, key, value]) => [key.toLowerCase(), value.trim()]));

const fetchBytes = async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return Buffer.from(await response.arrayBuffer());
};

const safeName = value => value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'extension';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

const saveAsset = async (sourceURL, relativePath) => {
    const bytes = await fetchBytes(sourceURL);
    const destination = path.join(OUTPUT, relativePath);
    await fs.mkdir(path.dirname(destination), {recursive: true});
    await fs.writeFile(destination, bytes);
    return {path: `ninja-extensions/${relativePath}`, sha256: hash(bytes), bytes: bytes.length};
};

const parallelMap = async (items, limit, mapper) => {
    const result = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            result[index] = await mapper(items[index], index);
        }
    };
    await Promise.all(Array.from({length: Math.min(limit, items.length)}, worker));
    return result;
};

const sync = async () => {
    const [twResponse, spResponse, pmResponse] = await Promise.all([
        fetch(`${TW_ROOT}generated-metadata/extensions-v0.json`),
        fetch(`${SP_ROOT}Gallery%20Files/Extension-Keys.json`),
        fetch(PM_LIST)
    ]);
    if (!twResponse.ok || !spResponse.ok || !pmResponse.ok) throw new Error('Unable to download extension indexes');
    // The gallery's list is a JS module: an array literal of plain objects.
    const pmSource = (await pmResponse.text()).replace(/^[\s\S]*?export default/, '').trim().replace(/;$/, '');
    const pmList = new Function(`return ${pmSource};`)(); // eslint-disable-line no-new-func
    const pm = pmList.filter(extension => Object.prototype.hasOwnProperty.call(PENGUINMOD, extension.code));
    const missing = Object.keys(PENGUINMOD).filter(code => !pmList.some(extension => extension.code === code));
    if (missing.length) console.warn(`Not in the PenguinMod gallery any more: ${missing.join(', ')}`);
    const tw = (await twResponse.json()).extensions;
    const sp = Object.entries((await spResponse.json()).extensions || {})
        .filter(([id]) => id !== 'override404' && id !== 'Example');

    await fs.mkdir(path.dirname(MANIFEST), {recursive: true});
    await fs.rm(OUTPUT, {recursive: true, force: true});
    await fs.mkdir(OUTPUT, {recursive: true});

    const entries = [
        ...tw.map(extension => ({source: 'TurboWarp', extension})),
        ...sp.map(([id, extension]) => ({source: 'SharkPool', extension: {...extension, id}}))
    ].filter(({source, extension}) => !EXCLUDED[source].includes(extension.id));

    const penguinMod = await parallelMap(pm, 10, async extension => {
        const overrides = PENGUINMOD[extension.code];
        const sourceId = extension.code.replace(/\.js$/, '').replace(/\//g, '-');
        const baseName = `penguinmod-${safeName(sourceId)}`;
        const scriptURL = `${PM_ROOT}extensions/${extension.code}`;
        const iconURL = extension.banner ? `${PM_ROOT}images/${extension.banner}` : `${TW_ROOT}images/unknown.svg`;
        const iconExtension = path.extname(new URL(iconURL).pathname) || '.svg';
        const [script, icon] = await Promise.all([
            saveAsset(scriptURL, `scripts/${baseName}.js`),
            saveAsset(iconURL, `icons/${baseName}${iconExtension}`)
        ]);
        return {
            source: 'PenguinMod',
            sourceId,
            sourceURL: scriptURL,
            name: overrides.name || extension.name,
            nameTranslations: {},
            description: overrides.description || extension.description || '',
            descriptionTranslations: {},
            author: [{name: extension.creatorAlias || extension.creator || 'PenguinMod'}],
            extensionURL: script.path,
            extensionSha256: script.sha256,
            extensionBytes: script.bytes,
            iconURL: icon.path,
            iconSha256: icon.sha256,
            tags: ['penguinmod', ...(extension.tags || []).map(String)],
            incompatibleWithScratch: true
        };
    });

    // Ninja's own: extensions/<name>.js with an icon beside it.
    const ownFiles = (await fs.readdir(OWN).catch(() => [])).filter(file => file.endsWith('.js'));
    const ninja = await Promise.all(ownFiles.map(async file => {
        const baseName = `ninja-${path.basename(file, '.js')}`;
        const bytes = await fs.readFile(path.join(OWN, file));
        const header = readHeader(bytes.toString('utf8'));
        const iconFile = (await fs.readdir(OWN)).find(other => other !== file &&
            path.basename(other, path.extname(other)) === path.basename(file, '.js'));
        await fs.mkdir(path.join(OUTPUT, 'scripts'), {recursive: true});
        await fs.mkdir(path.join(OUTPUT, 'icons'), {recursive: true});
        await fs.writeFile(path.join(OUTPUT, 'scripts', `${baseName}.js`), bytes);
        let icon = {path: '', sha256: ''};
        if (iconFile) {
            const iconBytes = await fs.readFile(path.join(OWN, iconFile));
            const relative = `icons/${baseName}${path.extname(iconFile)}`;
            await fs.writeFile(path.join(OUTPUT, relative), iconBytes);
            icon = {path: `ninja-extensions/${relative}`, sha256: hash(iconBytes)};
        }
        return {
            source: 'Ninja',
            sourceId: header.id || path.basename(file, '.js'),
            sourceURL: '',
            name: header.name || path.basename(file, '.js'),
            nameTranslations: {},
            description: header.description || '',
            descriptionTranslations: {},
            author: [{name: header.by || 'Ninja'}],
            extensionURL: `ninja-extensions/scripts/${baseName}.js`,
            extensionSha256: hash(bytes),
            extensionBytes: bytes.length,
            iconURL: icon.path,
            iconSha256: icon.sha256,
            tags: ['ninja'],
            incompatibleWithScratch: true
        };
    }));

    const manifest = await parallelMap(entries, 10, async ({source, extension}) => {
        const isTurboWarp = source === 'TurboWarp';
        const sourceId = isTurboWarp ? extension.id : extension.id;
        const baseName = `${source.toLowerCase()}-${safeName(sourceId)}`;
        const scriptURL = isTurboWarp ?
            `${TW_ROOT}${extension.slug}.js` :
            `${SP_ROOT}extension-code/${extension.url}`;
        const iconURL = isTurboWarp ?
            `${TW_ROOT}${extension.image || 'images/unknown.svg'}` :
            (extension.banner ?
                `${SP_ROOT}extension-thumbs/${extension.banner}` :
                `${TW_ROOT}images/unknown.svg`);
        const iconExtension = path.extname(new URL(iconURL).pathname) || '.svg';
        const [downloaded, icon] = await Promise.all([
            saveAsset(scriptURL, `scripts/${baseName}.js`),
            saveAsset(iconURL, `icons/${baseName}${iconExtension}`)
        ]);
        const script = await applyPatches(`${source}:${sourceId}`, downloaded);
        return {
            source,
            sourceId,
            sourceURL: scriptURL,
            name: isTurboWarp ? extension.name : extension.id,
            nameTranslations: extension.nameTranslations || {},
            description: isTurboWarp ? extension.description : (extension.desc || ''),
            descriptionTranslations: extension.descriptionTranslations || {},
            author: isTurboWarp ? [...(extension.original || []), ...(extension.by || [])] :
                [{name: extension.creator || 'SharkPool'}],
            extensionURL: script.path,
            extensionSha256: script.sha256,
            extensionBytes: script.bytes,
            iconURL: icon.path,
            iconSha256: icon.sha256,
            tags: isTurboWarp ? ['tw'] : ['sharkpool', ...(extension.tags || []).map(String)],
            incompatibleWithScratch: isTurboWarp ? !extension.scratchCompatible : true
        };
    });

    manifest.push(...penguinMod, ...ninja);
    manifest.sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
    const mobileNet = await saveAsset(`${MOBILENET_ROOT}model.json`, 'models/mobilenet/model.json');
    const mobileNetJSON = JSON.parse(await fs.readFile(path.join(OUTPUT, 'models/mobilenet/model.json')));
    const mobileNetShards = [...new Set(mobileNetJSON.weightsManifest.flatMap(group => group.paths))];
    await parallelMap(mobileNetShards, 5, shard => saveAsset(
        `${MOBILENET_ROOT}${shard}`,
        `models/mobilenet/${shard}`
    ));
    await fs.writeFile(MANIFEST, `${JSON.stringify({
        count: manifest.length,
        models: {mobileNet: mobileNet.path},
        extensions: manifest
    }, null, 2)}\n`);
    console.log(`Saved ${manifest.length} extensions to ${OUTPUT}`);
};

sync().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
