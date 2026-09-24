// Hidden extension categories are stored in the project under a Ninja key of
// the project-level extensionStorage. The VM restores that object verbatim on
// load but only saves keys that belong to loaded extensions, so saving goes
// through a wrapper around vm.toJSON.

const STORAGE_KEY = 'ninja';
const CHANGED_EVENT = 'NINJA_HIDDEN_EXTENSIONS_CHANGED';

const getHiddenExtensions = runtime => {
    const storage = runtime.extensionStorage && runtime.extensionStorage[STORAGE_KEY];
    return storage && Array.isArray(storage.hiddenExtensions) ? storage.hiddenExtensions : [];
};

const setExtensionHidden = (vm, extensionId, hidden) => {
    const current = getHiddenExtensions(vm.runtime);
    if (current.includes(extensionId) === hidden) return;
    const hiddenExtensions = hidden ?
        [...current, extensionId] :
        current.filter(id => id !== extensionId);
    vm.runtime.extensionStorage[STORAGE_KEY] = {
        ...vm.runtime.extensionStorage[STORAGE_KEY],
        hiddenExtensions
    };
    vm.runtime.emitProjectChanged();
    vm.emit(CHANGED_EVENT);
};

const installHiddenExtensionStorage = vm => {
    if (vm.ninjaHiddenExtensionsInstalled) return;
    vm.ninjaHiddenExtensionsInstalled = true;
    const toJSON = vm.toJSON.bind(vm);
    vm.toJSON = (optTargetId, serializationOptions) => {
        const json = toJSON(optTargetId, serializationOptions);
        const hidden = getHiddenExtensions(vm.runtime);
        if (optTargetId || !hidden.length) return json;
        const project = JSON.parse(json);
        const hiddenExtensions = hidden.filter(id => project.extensions.includes(id));
        if (!hiddenExtensions.length) return json;
        project.extensionStorage = {
            ...project.extensionStorage,
            [STORAGE_KEY]: {hiddenExtensions}
        };
        return JSON.stringify(project);
    };
};

export {
    CHANGED_EVENT,
    getHiddenExtensions,
    installHiddenExtensionStorage,
    setExtensionHidden
};
