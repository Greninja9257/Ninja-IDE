import SettingsStore from './settings-store';
import {BUILT_IN, CHOICES, readChoices} from './ninja-addon-choices';

// Ninja: addons are fixed. Everyone gets the defaults; settings saved in the
// browser or passed in the address (?addons=) are ignored. The only exception
// is the few people can switch on and off in Settings > Addons.
const settingStore = new SettingsStore();
// Nothing is read back, so nothing is saved either.
settingStore.remote = true;

const choices = readChoices();
for (const addonId of CHOICES) {
    if (BUILT_IN[addonId]) continue;
    if (typeof choices[addonId] === 'boolean') settingStore.setAddonEnabled(addonId, choices[addonId]);
}

export default settingStore;
