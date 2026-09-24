class LocalCloudProvider {
    constructor (vm, sessionId) {
        this.vm = vm;
        this.connection = {readyState: 1};
        this.channel = new BroadcastChannel(`ninja-local-cloud-${sessionId}`);
        this.channel.onmessage = event => {
            const message = event.data;
            if (message && message.type === 'set') {
                this.vm.postIOData('cloud', {
                    varUpdate: {name: message.name, value: message.value}
                });
            }
        };
    }
    createVariable (name, value) { this.updateVariable(name, value); }
    updateVariable (name, value) { this.channel.postMessage({type: 'set', name, value}); }
    renameVariable (oldName, newName) {
        if (oldName === newName) return;
        const stage = this.vm.runtime.getTargetForStage();
        const variable = stage && stage.lookupVariableByNameAndType(newName, '');
        if (variable) this.updateVariable(newName, variable.value);
    }
    deleteVariable () {}
    requestCloseConnection () {
        if (this.channel) this.channel.close();
        this.channel = null;
        this.connection = null;
        this.vm = null;
    }
}

export default LocalCloudProvider;
