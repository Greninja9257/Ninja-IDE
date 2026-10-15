import log from './log';

// A custom font whose file can't be found (not in the sb3 and not on the asset
// server) gets added with a null asset, and every later save then crashes on it.
// Keep it as a system font instead: the file is dropped, the name stays in the
// font list and its text draws in the font's fallback.

const installFontFallback = vm => {
    const fontManager = vm.runtime.fontManager;
    if (fontManager.ninjaFontFallbackInstalled) return;
    fontManager.ninjaFontFallbackInstalled = true;
    const addCustomFont = fontManager.addCustomFont.bind(fontManager);
    fontManager.addCustomFont = (family, fallback, asset) => {
        if (asset) return addCustomFont(family, fallback, asset);
        log.warn(`Font file for "${family}" is missing, using fallback ${fallback}`);
        fontManager.addSystemFont(family, fallback);
    };
};

export {
    installFontFallback
};
