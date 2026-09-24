import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const TW_ROOT = 'https://extensions.turbowarp.org/';
const SP_ROOT = 'https://sharkpools-extensions.vercel.app/';
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
        'cs2627883NumericalEncoding' // Numerical Encoding V1, replaced by V2
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
        'Geolocation' // TurboWarp: Geolocation
    ]
};

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
    const [twResponse, spResponse] = await Promise.all([
        fetch(`${TW_ROOT}generated-metadata/extensions-v0.json`),
        fetch(`${SP_ROOT}Gallery%20Files/Extension-Keys.json`)
    ]);
    if (!twResponse.ok || !spResponse.ok) throw new Error('Unable to download extension indexes');
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
        const [script, icon] = await Promise.all([
            saveAsset(scriptURL, `scripts/${baseName}.js`),
            saveAsset(iconURL, `icons/${baseName}${iconExtension}`)
        ]);
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
