const startStates = new WeakMap();

const captureMultiplayerStartState = vm => {
    // saveProjectSb3 serializes project.json synchronously before compressing,
    // so later runtime changes cannot leak into this starting-state snapshot.
    const snapshot = vm.saveProjectSb3('arraybuffer');
    startStates.set(vm, snapshot);
    return snapshot;
};

const getMultiplayerStartState = vm => {
    const snapshot = startStates.get(vm) || captureMultiplayerStartState(vm);
    return snapshot.then(project => project.slice(0));
};

export {
    captureMultiplayerStartState,
    getMultiplayerStartState
};
