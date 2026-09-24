import React from 'react';

import catalog from './generated/ninja-extension-catalog.json';
import {getExtensionCategory} from './libraries/ninja-extension-categories';

const localURL = relativePath => new URL(`${process.env.ROOT}${relativePath}`, location.href).href;

const catalogExtensions = catalog.extensions;

const duplicateNames = catalogExtensions.reduce((counts, extension) => {
    const name = extension.name.toLocaleLowerCase();
    counts[name] = (counts[name] || 0) + 1;
    return counts;
}, {});

const toLibraryExtension = extension => ({
    name: duplicateNames[extension.name.toLocaleLowerCase()] > 1 ?
        `${extension.name} — ${extension.source}` : extension.name,
    nameTranslations: extension.nameTranslations || {},
    description: extension.description,
    descriptionTranslations: extension.descriptionTranslations || {},
    // External extensions are tracked by their canonical same-origin URL. The
    // VM resolves that URL to the ID declared by the extension after loading.
    extensionId: localURL(extension.extensionURL),
    extensionURL: localURL(extension.extensionURL),
    iconURL: localURL(extension.iconURL),
    tags: [getExtensionCategory(`${extension.source}:${extension.sourceId}`)].filter(Boolean),
    credits: extension.author.map(author => author.link ? (
        <a href={author.link} target="_blank" rel="noreferrer" key={author.name}>{author.name}</a>
    ) : author.name),
    incompatibleWithScratch: extension.incompatibleWithScratch,
    featured: true,
    source: extension.source,
    sourceURL: extension.sourceURL
});

const localCatalog = catalogExtensions.map(toLibraryExtension);
const fetchAllGalleries = () => Promise.resolve(localCatalog);
const fetchTurboWarp = () => Promise.resolve(localCatalog.filter(extension => extension.source === 'TurboWarp'));
const fetchSharkPool = () => Promise.resolve(localCatalog.filter(extension => extension.source === 'SharkPool'));

const GALLERIES = [
    {id: 'turbowarp', fetch: fetchTurboWarp},
    {id: 'sharkpool', fetch: fetchSharkPool}
];

export {
    fetchAllGalleries,
    fetchTurboWarp,
    fetchSharkPool,
    GALLERIES
};
