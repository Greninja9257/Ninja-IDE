// What people can switch on and off themselves, in Settings > Addons: the extra
// controls and displays some people don't want. Every other addon is fixed.
// All of these switch off without a reload.
const CHOICES = [
    'vol-slider',
    'pause',
    'mouse-pos',
    'clones',
    'find-bar',
    'onion-skinning'
];

// Not addons: Ninja's own, switched on and off the same way.
const BUILT_IN = {
    pause: 'Pause button'
};

const STORAGE_KEY = 'ninja:addons';
const CHANGED = 'ninja:addon-choice';

// {id: true/false} for the ones someone has changed.
const readChoices = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return saved && typeof saved === 'object' ? saved : {};
    } catch (e) {
        return {};
    }
};

const saveChoice = (id, enabled) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({...readChoices(), [id]: enabled}));
    } catch (e) {
        // not saved; still applies until the page is closed
    }
    window.dispatchEvent(new CustomEvent(CHANGED, {detail: {id, enabled}}));
};

// For the built-in ones: on unless switched off.
const isBuiltInOn = id => readChoices()[id] !== false;

export {BUILT_IN, CHANGED, CHOICES, isBuiltInOn, readChoices, saveChoice};
