class LocalCloudProvider {
    constructor (vm, sessionId) {
        this.vm = vm;
        this.sessionId = sessionId;
        this.connection = {readyState: 1};
        this.channel = new BroadcastChannel(`ninja-local-cloud-${sessionId}`);
        this.channel.onmessage = event => {
            this.applyMessage(event.data);
        };
        this.handleWindowMessage = this.handleWindowMessage.bind(this);
        if (typeof window === 'object') window.addEventListener('message', this.handleWindowMessage);
    }
    applyMessage (message) {
        if (message && message.type === 'ninja-local-cloud-set' && message.sessionId === this.sessionId) {
            this.vm.postIOData('cloud', {
                varUpdate: {name: message.name, value: message.value}
            });
        }
    }
    handleWindowMessage (event) {
        if (event.origin !== location.origin) return;
        const message = event.data;
        if (!message || message.type !== 'ninja-local-cloud-set' || message.sessionId !== this.sessionId) return;
        this.applyMessage(message);

        // The editor is the host for its multiplayer iframes. Relay an update
        // from one test window to every other test window.
        if (window.parent === window) {
            for (let i = 0; i < window.frames.length; i++) {
                if (window.frames[i] !== event.source) window.frames[i].postMessage(message, location.origin);
            }
        }
    }
    createVariable (name, value) {
        this.updateVariable(name, value);
    }
    updateVariable (name, value) {
        const message = {
            type: 'ninja-local-cloud-set',
            sessionId: this.sessionId,
            name,
            value
        };
        // BroadcastChannel does not deliver messages back to the sender. The VM
        // needs this confirmation to finish creating a simulated cloud variable.
        this.vm.postIOData('cloud', {
            varUpdate: {name: message.name, value: message.value}
        });
        this.channel.postMessage(message);
        if (typeof window === 'object') {
            if (window.parent === window) {
                for (let i = 0; i < window.frames.length; i++) {
                    window.frames[i].postMessage(message, location.origin);
                }
            } else {
                window.parent.postMessage(message, location.origin);
            }
        }
    }
    renameVariable (oldName, newName) {
        if (oldName === newName) return;
        const stage = this.vm.runtime.getTargetForStage();
        const variable = stage && stage.lookupVariableByNameAndType(newName, '');
        if (variable) this.updateVariable(newName, variable.value);
    }
    deleteVariable () {}
    requestCloseConnection () {
        if (typeof window === 'object') window.removeEventListener('message', this.handleWindowMessage);
        if (this.channel) this.channel.close();
        this.channel = null;
        this.connection = null;
        this.sessionId = null;
        this.vm = null;
    }
}

export default LocalCloudProvider;
