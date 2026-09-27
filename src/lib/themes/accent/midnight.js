/**
 * Ninja's default accent: a dark blue close to black.
 *
 * Like the other accent themes, primary controls and the menu bar use the same
 * core accent color.
 */
const guiColors = {
    'motion-primary': 'hsla(218, 45%, 17%, 1)',
    'motion-primary-transparent': 'hsla(218, 45%, 17%, 0.9)',
    'motion-tertiary': 'hsla(218, 50%, 11%, 1)',

    'looks-secondary': 'hsla(218, 45%, 17%, 1)',
    'looks-transparent': 'hsla(218, 45%, 17%, 0.35)',
    'looks-light-transparent': 'hsla(218, 45%, 17%, 0.15)',
    'looks-secondary-dark': 'hsla(218, 50%, 11%, 1)',

    'extensions-primary': 'hsla(218, 45%, 30%, 1)',
    'extensions-tertiary': 'hsla(218, 45%, 20%, 1)',
    'extensions-transparent': 'hsla(218, 45%, 30%, 0.35)',
    'extensions-light': 'hsla(218, 30%, 80%, 1)',

    'drop-highlight': 'hsla(218, 55%, 55%, 1)'
};

const blockColors = {
    checkboxActiveBackground: 'hsla(218, 45%, 17%, 1)',
    checkboxActiveBorder: 'hsla(218, 50%, 11%, 1)'
};

// On the dark theme the navy above disappears into the background, so the
// same blue, lightened: readable as text and selection on near-black, and
// still clearly Ninja's.
const darkGuiColors = {
    'motion-primary': 'hsla(214, 65%, 48%, 1)',
    'motion-primary-transparent': 'hsla(214, 65%, 48%, 0.9)',
    'motion-tertiary': 'hsla(214, 65%, 38%, 1)',

    'looks-secondary': 'hsla(214, 80%, 60%, 1)',
    'looks-transparent': 'hsla(214, 80%, 60%, 0.35)',
    'looks-light-transparent': 'hsla(214, 80%, 60%, 0.15)',
    'looks-secondary-dark': 'hsla(214, 65%, 52%, 1)',

    'extensions-primary': 'hsla(214, 55%, 45%, 1)',
    'extensions-tertiary': 'hsla(214, 55%, 35%, 1)',
    'extensions-transparent': 'hsla(214, 55%, 45%, 0.35)',
    'extensions-light': 'hsla(214, 30%, 80%, 1)',

    'drop-highlight': 'hsla(214, 80%, 60%, 1)'
};

const darkBlockColors = {
    checkboxActiveBackground: 'hsla(214, 65%, 48%, 1)',
    checkboxActiveBorder: 'hsla(214, 65%, 38%, 1)'
};

export {
    guiColors,
    blockColors,
    darkGuiColors,
    darkBlockColors
};
