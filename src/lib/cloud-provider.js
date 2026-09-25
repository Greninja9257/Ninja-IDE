import log from './log.js';

/**
 * Cloud data provider for projects on a Ninja server.
 *
 * The wire protocol lives in the server's /cloud/client.js, which is
 * regenerated (new keys, opcodes and obfuscation) every few hours. This class
 * loads that client, hands it the project id, and translates between it and
 * the VM's cloud IO device. When the server rotates the protocol the client
 * reports 'stale' and a fresh one is loaded.
 */

let clientPromise = null;
const loadClient = () => {
    if (!clientPromise) {
        clientPromise = fetch('/cloud/client.js', {credentials: 'same-origin', cache: 'no-store'})
            .then(res => {
                if (!res.ok) throw new Error(`cloud client: HTTP ${res.status}`);
                return res.text();
            })
            .then(source => {
                const exports = {};
                // eslint-disable-next-line no-new-func
                new Function('exports', source)(exports);
                return exports.create;
            })
            .catch(err => {
                clientPromise = null;
                throw err;
            });
    }
    return clientPromise;
};

class CloudProvider {
    /**
     * @param {string} cloudHost Unused; the client always talks to its own origin.
     * @param {VirtualMachine} vm The VM to deliver cloud updates to.
     * @param {string} username Unused; the server identifies the signed-in account.
     * @param {string} projectId The project whose cloud variables to join.
     */
    constructor (cloudHost, vm, username, projectId) {
        this.vm = vm;
        this.projectId = projectId;
        this.client = null;
        this.closed = false;
        // Truthy while this provider is active; the cloud manager reads it.
        this.connection = true;
        this.start();
    }

    start () {
        loadClient()
            .then(create => {
                if (this.closed) return;
                this.client = create({
                    projectId: Number(this.projectId),
                    onUpdate: (name, value) => {
                        this.vm.postIOData('cloud', {varUpdate: {name, value}});
                    },
                    onStatus: status => {
                        if (status === 'stale' && !this.closed) {
                            clientPromise = null;
                            this.client = null;
                            this.start();
                        } else if (status === 'closed') {
                            log.info('Cloud variables are unavailable for this project.');
                        }
                    }
                });
            })
            .catch(err => {
                log.warn('Could not load cloud client', err);
                if (!this.closed) setTimeout(() => this.start(), 15000);
            });
    }

    // tw: method called when username is invalid
    onInvalidUsername () { /* no-op */ }

    createVariable () {
        // Variables come from the saved project on the server.
    }

    updateVariable (name, value) {
        if (this.client) this.client.set(name, value);
    }

    renameVariable () {
        // Renames take effect when the project is saved.
    }

    deleteVariable () {
        // Deletions take effect when the project is saved.
    }

    requestCloseConnection () {
        this.closed = true;
        if (this.client) this.client.close();
        this.clear();
    }

    clear () {
        this.client = null;
        this.connection = null;
        this.vm = null;
    }
}

export default CloudProvider;
