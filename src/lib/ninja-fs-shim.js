/**
 * Node's `fs`, as far as @turbowarp/packager needs it, backed by the browser.
 *
 * The packager ships only its Node build, whose I/O layer cannot be replaced
 * from outside. It uses `fs` for exactly two things, relative to `__dirname`
 * (which webpack makes "/"):
 *
 * - Reading files it ships: its runtime ("/scaffolding/…") and its default app
 *   icon. The editor serves those next to itself, so they are fetched.
 * - A cache of large downloads (the Electron runtime, ~100 MB) under
 *   "/.packager-cache/". That lives in Cache Storage, so each desktop runtime
 *   is downloaded once rather than on every export.
 *
 * Anything else fails the way Node would, with ENOENT.
 */

import {Buffer} from 'buffer';

const CACHE_DIR = '/.packager-cache/';
const CACHE_NAME = 'ninja-packager';

const enoent = path => Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), {
    code: 'ENOENT',
    path
});

const cacheKey = path => new URL(path, 'https://ninja-packager-cache.invalid/').href;

const openCache = () => (typeof caches === 'undefined' ? Promise.resolve(null) : caches.open(CACHE_NAME));

const fetchServed = async path => {
    const response = await fetch(`${process.env.ROOT}${path.replace(/^\/+/, '')}`);
    if (!response.ok) throw enoent(path);
    return response;
};

// Split Node's `(path, [options], callback)` arguments.
const callbackArgs = args => {
    const callback = args[args.length - 1];
    const options = args.length > 2 ? args[1] : null;
    const encoding = typeof options === 'string' ? options : options && options.encoding;
    return {callback, encoding};
};

const readFile = (path, ...rest) => {
    const {callback, encoding} = callbackArgs([path, ...rest]);
    (async () => {
        let response;
        if (path.startsWith(CACHE_DIR)) {
            const cache = await openCache();
            response = cache && await cache.match(cacheKey(path));
            if (!response) throw enoent(path);
        } else {
            response = await fetchServed(path);
        }
        if (encoding) return response.text();
        return Buffer.from(await response.arrayBuffer());
    })().then(data => callback(null, data), error => callback(error));
};

const writeFile = (path, data, ...rest) => {
    const {callback} = callbackArgs([path, data, ...rest]);
    (async () => {
        if (!path.startsWith(CACHE_DIR)) throw enoent(path);
        const cache = await openCache();
        if (cache) await cache.put(cacheKey(path), new Response(data));
    })().then(() => callback(null), error => callback(error));
};

// Cache Storage has no directories, so there is nothing to create.
const mkdir = (path, ...rest) => {
    const {callback} = callbackArgs([path, ...rest]);
    setTimeout(() => callback(null), 0);
};

const unsupported = name => (path, ...rest) => {
    const callback = rest[rest.length - 1];
    const error = Object.assign(new Error(`fs.${name} is not supported in the browser`), {code: 'ENOSYS', path});
    if (typeof callback === 'function') setTimeout(() => callback(error), 0);
    else throw error;
};

const readdir = unsupported('readdir');
const stat = unsupported('stat');
const unlink = unsupported('unlink');

export default {readFile, writeFile, mkdir, readdir, stat, unlink};
export {readFile, writeFile, mkdir, readdir, stat, unlink};
