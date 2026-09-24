/**
 * Packaging a project into something you can hand to someone.
 *
 * Wraps `@turbowarp/packager`, which already knows how to turn a project into
 * a standalone HTML file or bundle it with an Electron/NW.js runtime for each
 * desktop platform. The desktop runtimes are large and are fetched on demand
 * the first time a platform is used.
 */

import appIconURL from './ninja-app-icon.png';

/**
 * What Ninja offers, and which packager target each maps to.
 *
 * Several packager targets exist per platform (Electron, NW.js, a native
 * WebView); one is chosen per platform so the list stays a list of places to
 * run rather than a list of embedding technologies.
 */
const EXPORT_TARGETS = [
    {
        id: 'html',
        name: 'HTML',
        target: 'html',
        extension: 'html'
    },
    {
        id: 'zip',
        name: 'Web folder',
        target: 'zip',
        extension: 'zip'
    },
    {
        id: 'windows',
        name: 'Windows',
        target: 'electron-win64',
        extension: 'zip',
        large: true
    },
    {
        id: 'mac',
        name: 'macOS',
        target: 'electron-mac',
        extension: 'zip',
        large: true
    },
    {
        id: 'linux',
        name: 'Linux',
        target: 'electron-linux64',
        extension: 'zip',
        large: true
    }
];

/**
 * Package the project.
 *
 * @param {object} config
 * @param {ArrayBuffer} config.projectData The .sb3 as produced by the VM.
 * @param {object} config.exportTarget An entry from EXPORT_TARGETS.
 * @param {string} config.title Used for the window title and file name.
 * @param {function} [config.onProgress] Called with (type, progress 0..1).
 * @returns {Promise<{data: Blob, filename: string}>}
 */
const packageProject = async ({projectData, exportTarget, title, onProgress}) => {
    // Imported lazily: the packager pulls in JSZip and its own runtime, which
    // is a lot to load for a session that never exports anything.
    const {Packager, Image, loadProject} = await import(
        /* webpackChunkName: "ninja-packager" */ '@turbowarp/packager'
    );

    const loaded = await loadProject(projectData, (type, a, b) => {
        if (onProgress) onProgress(type, b ? a / b : a);
    });

    const packager = new Packager();
    packager.project = loaded;
    packager.options.target = exportTarget.target;
    packager.options.app.windowTitle = title;
    packager.options.app.packageName = safeName(title);
    packager.options.loadingScreen.progressBar = true;
    // Start as soon as it loads, rather than waiting on a click to begin.
    packager.options.autoplay = true;
    // Exported apps carry Ninja's icon, not the packager's default.
    const icon = await fetch(appIconURL);
    packager.options.app.icon = new Image('image/png', await icon.arrayBuffer());

    if (onProgress) {
        packager.onprogress = (type, progress) => onProgress(type, progress);
    }

    const result = await packager.package();

    return {
        data: new Blob([result.data], {type: result.type}),
        filename: `${safeName(title)}.${exportTarget.extension}`
    };
};

/** A file name that survives every platform Ninja exports to. */
const safeName = title => (title || 'project')
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase() || 'project';

const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
};

export {
    EXPORT_TARGETS,
    packageProject,
    downloadBlob,
    safeName
};
