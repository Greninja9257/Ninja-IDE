// Live collaboration for the editor.
//
// Everyone editing a project together connects to the server's /collab room
// for it. Each editor captures its own changes as small operations (a block
// event, a costume added, a sprite renamed, ...), sends them in order, and
// replays everyone else's. The server only relays; it also asks someone
// already in the room to send a newcomer the current, unsaved project.
//
// Sprites are named rather than referred to by id: each editor gives its
// targets its own ids, but names are unique within a project. Anything an
// operation refers to that lives in the asset store (a new costume, a painted
// one, a recorded sound) is uploaded before the operation is sent, so the
// others can load it by its md5.
import storage from './storage';
import storeProjectAssets from './store-project-assets';

const STAGE = '__stage__';
// How often to check for a drag or typing starting or stopping (ms), and
// how quickly a block someone is dragging follows their cursor: the same
// rate the overlay eases cursors at, so the two move together.
const LIVE_INTERVAL = 40;
const DRAG_EASE = 60;
// Blockly events caused by replaying someone else's edit carry this group,
// so they aren't sent back out, while this person's own edits made in the
// same moment still are.
const REMOTE_GROUP = 'ninja-collab-remote';
// Redrawing the code area (switching sprites, loading the project) deletes
// and recreates every block on screen. Those events reach the VM too, but
// aren't edits: they carry this group and are never sent.
const RELOAD_GROUP = 'ninja-collab-reload';
const BLOCK_EVENTS = new Set([
    'create', 'delete', 'move', 'change',
    'var_create', 'var_rename', 'var_delete',
    'comment_create', 'comment_change', 'comment_move', 'comment_delete'
]);

const targetKey = target => (target.isStage ? STAGE : target.sprite.name);

// The Blockly event's own fields, as plain data the VM can read again.
const plainEvent = e => {
    const out = {};
    for (const key of Object.keys(e)) {
        const value = e[key];
        if (key === 'xml') {
            if (value && value.outerHTML) out.xml = value.outerHTML;
        } else if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
            out[key] = value;
        } else if (typeof value === 'object' && !value.nodeType && !Array.isArray(value)) {
            try {
                out[key] = JSON.parse(JSON.stringify(value));
            } catch (err) {
                // Not plain data (a workspace, say): the VM doesn't read it.
            }
        } else if (Array.isArray(value)) {
            out[key] = value.slice();
        }
    }
    // Blockly keeps the event type on the prototype.
    out.type = e.type;
    return out;
};

// What the others need to load a costume or sound again from the asset store.
const costumeData = c => ({
    name: c.name,
    assetId: c.assetId,
    dataFormat: c.dataFormat,
    md5ext: c.md5 || `${c.assetId}.${c.dataFormat}`,
    bitmapResolution: c.bitmapResolution,
    rotationCenterX: c.rotationCenterX,
    rotationCenterY: c.rotationCenterY
});
const soundData = s => ({
    name: s.name,
    assetId: s.assetId,
    dataFormat: s.dataFormat,
    md5: s.md5 || `${s.assetId}.${s.dataFormat}`,
    format: s.format,
    rate: s.rate,
    sampleCount: s.sampleCount
});

class CollabSession {
    constructor (vm, projectId, handlers) {
        this.vm = vm;
        this.projectId = projectId;
        this.handlers = handlers;
        this.remote = 0; // > 0 while applying someone else's change
        this.sendQueue = Promise.resolve();
        this.applyQueue = Promise.resolve();
        this.catchingUp = false;
        this.buffered = [];
        this.originals = new Map();
        this.closed = false;
        this.attempts = 0;
        this.peers = new Map();
        this.cursors = new Map(); // each peer's latest view, for following them
        this.drags = new Map(); // block id -> who is dragging it, and where it sits from their cursor
        this.mouse = null;
        this.handleMouseMove = e => {
            this.mouse = {x: e.clientX, y: e.clientY};
        };
        document.addEventListener('mousemove', this.handleMouseMove, true);
        this.previews = new Map(); // "block:field" -> text before someone started typing
        this.install();
        this.connect();
        this.liveTimer = setInterval(() => this.sendLive(), LIVE_INTERVAL);
        this.dragFrame = requestAnimationFrame(t => this.animateDrags(t));
    }

    /* ------------------------------------------------------------ transport */

    connect () {
        if (this.closed) return;
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${location.host}/collab?project=${this.projectId}`);
        this.ws = ws;
        ws.onmessage = event => {
            let message;
            try {
                message = JSON.parse(event.data);
            } catch (e) {
                return;
            }
            this.receive(message);
        };
        ws.onclose = event => {
            this.handlers.onPeers([]);
            if (this.closed || event.code === 4403) {
                if (event.code === 4403) this.handlers.onStatus('removed');
                return;
            }
            this.handlers.onStatus('reconnecting');
            this.attempts++;
            setTimeout(() => this.connect(), Math.min(15000, 1000 * this.attempts));
        };
    }

    rawSend (message) {
        if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(message));
    }

    // Operations go out strictly in the order they happened, each after any
    // asset it refers to has reached the server.
    sendOp (makeOp, {upload = false} = {}) {
        if (this.remote || this.closed) return;
        this.sendQueue = this.sendQueue
            .then(async () => {
                if (upload) await storeProjectAssets(storage, this.vm.assets);
                const op = await makeOp();
                if (op) this.rawSend({t: 'op', op});
            })
            .catch(err => console.warn('collab: could not send a change', err)); // eslint-disable-line no-console
    }

    sendCursor (cursor) {
        this.rawSend({t: 'cursor', cursor});
    }

    sendChat (text, cursor) {
        this.rawSend({t: 'chat', text, cursor});
    }

    receive (message) {
        switch (message.t) {
        case 'welcome':
            this.attempts = 0;
            this.me = message.you;
            this.peers = new Map(message.peers.map(p => [p.id, p]));
            this.cursors = new Map();
            this.catchingUp = message.catchUp;
            this.buffered = [];
            this.handlers.onStatus(this.catchingUp ? 'catching-up' : 'live');
            this.handlers.onPeers([...this.peers.values()], this.me);
            break;
        case 'join':
            this.peers.set(message.peer.id, message.peer);
            this.handlers.onPeers([...this.peers.values()], this.me);
            break;
        case 'leave':
            this.peers.delete(message.id);
            this.cursors.delete(message.id);
            this.handlers.onPeers([...this.peers.values()], this.me);
            this.handlers.onCursor(message.id, null);
            break;
        case 'cursor':
            this.cursors.set(message.from, message.cursor);
            this.handlers.onCursor(message.from, message.cursor);
            break;
        case 'live':
            this.receiveLive(message.live, message.from);
            break;
        case 'chat':
            this.handlers.onChat(message.from === (this.me && this.me.id) ? this.me : this.peers.get(message.from),
                message.text, message.cursor);
            break;
        case 'snapshot-request':
            // Someone joined: send them the project as it is right now.
            this.sendQueue = this.sendQueue.then(async () => {
                await storeProjectAssets(storage, this.vm.assets);
                this.rawSend({t: 'snapshot', for: message.for, project: JSON.parse(this.vm.toJSON())});
            }).catch(err => console.warn('collab: could not send the project', err)); // eslint-disable-line no-console
            break;
        case 'snapshot':
            this.applyQueue = this.applyQueue.then(() => this.loadSnapshot(message.project));
            break;
        case 'op':
            if (this.catchingUp) this.buffered.push(message.op);
            else this.enqueue(message.op);
            break;
        }
    }

    enqueue (op) {
        this.applyQueue = this.applyQueue
            .then(() => this.apply(op))
            .catch(err => console.warn('collab: could not apply a change', op && op.kind, err)); // eslint-disable-line no-console
    }

    async loadSnapshot (project) {
        const editing = this.vm.editingTarget && targetKey(this.vm.editingTarget);
        await this.quiet(() => this.vm.loadProject(project));
        const again = editing && this.find(editing);
        if (again) this.quiet(() => this.vm.setEditingTarget(again.id));
        this.catchingUp = false;
        this.handlers.onStatus('live');
        const pending = this.buffered;
        this.buffered = [];
        pending.forEach(op => this.enqueue(op));
    }

    close () {
        this.closed = true;
        clearInterval(this.liveTimer);
        document.removeEventListener('mousemove', this.handleMouseMove, true);
        cancelAnimationFrame(this.dragFrame);
        if (this.ws) this.ws.close();
        this.uninstall();
    }

    /* ------------------------------------------------------ capturing edits */

    install () {
        const vm = this.vm;
        const session = this;

        // Block edits reach the VM through Blocks#blocklyListen; only the
        // editing target's own workspace counts (not the flyout or monitors).
        const proto = Object.getPrototypeOf(vm.runtime.flyoutBlocks);
        const originalListen = proto.blocklyListen;
        this.originals.set('blocklyListen', {owner: proto, value: originalListen});
        proto.blocklyListen = function (e) {
            const result = originalListen.call(this, e);
            if (!session.remote && e && e.group !== REMOTE_GROUP && e.group !== RELOAD_GROUP && BLOCK_EVENTS.has(e.type) && e.element !== 'stackclick' &&
                vm.editingTarget && this === vm.editingTarget.blocks) {
                const target = targetKey(vm.editingTarget);
                const json = typeof e.toJson === 'function' ? e.toJson() : null;
                const data = plainEvent(e);
                session.sendOp(() => ({kind: 'block', target, json, event: data}));
            }
            return result;
        };

        this.patchReload();

        const wrap = (name, after) => {
            const original = vm[name];
            if (typeof original !== 'function') return;
            this.originals.set(name, {owner: vm, value: original, own: Object.prototype.hasOwnProperty.call(vm, name)});
            vm[name] = function (...args) {
                if (session.remote) return original.apply(vm, args);
                const before = {editing: vm.editingTarget, targets: vm.runtime.targets.slice()};
                const result = original.apply(vm, args);
                Promise.resolve(result).then(value => after(args, before, value), () => {});
                return result;
            };
        };

        const editingKey = before => before.editing && targetKey(before.editing);
        const byId = id => vm.runtime.getTargetById(id);

        // Sprites.
        const newSprite = before => {
            const known = new Set(before.targets.map(t => t.id));
            const added = vm.runtime.targets.find(t => t.isOriginal && !t.isStage && !known.has(t.id));
            if (added) this.sendOp(() => ({kind: 'addSprite', sprite: JSON.parse(vm.toJSON(added.id))}), {upload: true});
        };
        wrap('addSprite', (args, before) => newSprite(before));
        wrap('duplicateSprite', (args, before) => newSprite(before));
        wrap('deleteSprite', ([id], before) => {
            const target = before.targets.find(t => t.id === id);
            if (target) this.sendOp(() => ({kind: 'deleteSprite', target: target.sprite.name}));
        });
        const originalRename = vm.renameSprite;
        wrap('renameSprite', ([id]) => {
            const target = byId(id);
            if (target) this.sendOp(() => ({kind: 'renameSprite', from: this.lastName, to: target.sprite.name}));
        });
        // renameSprite needs the old name, which is gone once it runs.
        const renameWrapper = vm.renameSprite;
        vm.renameSprite = function (id, newName) {
            const target = byId(id);
            session.lastName = target && target.sprite ? target.sprite.name : null;
            return renameWrapper.call(vm, id, newName);
        };
        this.originals.set('renameSprite', {owner: vm, value: originalRename, own: false});
        wrap('reorderTarget', ([from, to], before) => {
            const target = before.targets[from];
            if (target) this.sendOp(() => ({kind: 'reorderTarget', target: targetKey(target), to}));
        });
        // Dragging a sprite on the stage reports every frame: send its latest
        // state at most ten times a second.
        this.spriteInfo = new Map();
        wrap('postSpriteInfo', ([data], before) => {
            const target = vm._dragTarget || before.editing;
            if (!target) return;
            const key = targetKey(target);
            const pending = this.spriteInfo.get(key);
            if (pending) {
                Object.assign(pending.data, data);
                return;
            }
            const entry = {data: Object.assign({}, data)};
            this.spriteInfo.set(key, entry);
            setTimeout(() => {
                this.spriteInfo.delete(key);
                this.sendOp(() => ({kind: 'spriteInfo', target: key, data: entry.data}));
            }, 100);
        });

        // Costumes.
        wrap('addCostume', ([, , optTargetId], before) => {
            const target = optTargetId ? byId(optTargetId) : before.editing;
            if (!target) return;
            const costumes = target.getCostumes();
            const costume = costumes[costumes.length - 1];
            this.sendOp(() => ({kind: 'addCostume', target: targetKey(target), costume: costumeData(costume)}), {upload: true});
        });
        wrap('duplicateCostume', ([index], before) => {
            const target = before.editing;
            const costume = target && target.getCostumes()[index + 1];
            if (costume) {
                this.sendOp(() => ({kind: 'insertCostume', target: targetKey(target), index: index + 1,
                    costume: costumeData(costume)}), {upload: true});
            }
        });
        wrap('renameCostume', ([index, name], before) => {
            if (before.editing) this.sendOp(() => ({kind: 'renameCostume', target: editingKey(before), index, name}));
        });
        wrap('deleteCostume', ([index], before) => {
            if (before.editing) this.sendOp(() => ({kind: 'deleteCostume', target: editingKey(before), index}));
        });
        wrap('reorderCostume', ([id, from, to]) => {
            const target = byId(id);
            if (target) this.sendOp(() => ({kind: 'reorderCostume', target: targetKey(target), from, to}));
        });
        const paintEdit = (index, before) => {
            const target = before.editing;
            if (!target) return;
            // The paint editor reports every stroke; send the latest after a pause.
            clearTimeout(this.paintTimer);
            this.paintTimer = setTimeout(() => {
                const costume = target.getCostumes()[index];
                if (!costume) return;
                this.sendOp(() => ({kind: 'paint', target: targetKey(target), index, costume: costumeData(costume)}),
                    {upload: true});
            }, 400);
        };
        wrap('updateSvg', ([index], before) => paintEdit(index, before));
        wrap('updateBitmap', ([index], before) => paintEdit(index, before));
        wrap('shareCostumeToTarget', ([, id]) => {
            const target = byId(id);
            if (!target) return;
            const costumes = target.getCostumes();
            this.sendOp(() => ({kind: 'addCostume', target: targetKey(target), costume: costumeData(costumes[costumes.length - 1])}),
                {upload: true});
        });

        // Sounds.
        wrap('addSound', ([, optTargetId], before) => {
            const target = optTargetId ? byId(optTargetId) : before.editing;
            if (!target) return;
            const sounds = target.getSounds();
            this.sendOp(() => ({kind: 'addSound', target: targetKey(target), sound: soundData(sounds[sounds.length - 1])}),
                {upload: true});
        });
        wrap('duplicateSound', ([index], before) => {
            const target = before.editing;
            const sound = target && target.getSounds()[index + 1];
            if (sound) {
                this.sendOp(() => ({kind: 'insertSound', target: targetKey(target), index: index + 1, sound: soundData(sound)}),
                    {upload: true});
            }
        });
        wrap('renameSound', ([index, name], before) => {
            if (before.editing) this.sendOp(() => ({kind: 'renameSound', target: editingKey(before), index, name}));
        });
        wrap('deleteSound', ([index], before) => {
            if (before.editing) this.sendOp(() => ({kind: 'deleteSound', target: editingKey(before), index}));
        });
        wrap('reorderSound', ([id, from, to]) => {
            const target = byId(id);
            if (target) this.sendOp(() => ({kind: 'reorderSound', target: targetKey(target), from, to}));
        });
        wrap('updateSoundBuffer', ([index], before) => {
            const target = before.editing;
            const sound = target && target.getSounds()[index];
            if (sound) {
                this.sendOp(() => ({kind: 'replaceSound', target: targetKey(target), index, sound: soundData(sound)}),
                    {upload: true});
            }
        });
        wrap('shareSoundToTarget', ([, id]) => {
            const target = byId(id);
            if (!target) return;
            const sounds = target.getSounds();
            this.sendOp(() => ({kind: 'addSound', target: targetKey(target), sound: soundData(sounds[sounds.length - 1])}),
                {upload: true});
        });

        // Blocks dropped on another sprite, pasted from the backpack, etc.:
        // the VM gives them fresh ids, so send the blocks it actually made.
        wrap('shareBlocksToTarget', ([, id], before) => {
            const target = byId(id);
            if (!target) return;
            const had = new Set(Object.keys(before.blockIds || {}));
            const blocks = Object.values(target.blocks._blocks).filter(b => !had.has(b.id) && !this.knownBlocks.has(b.id));
            this.sendOp(() => ({kind: 'addBlocks', target: targetKey(target), blocks: JSON.parse(JSON.stringify(blocks))}));
        });
        // shareBlocksToTarget's "before" needs the target's block ids.
        const shareWrapper = vm.shareBlocksToTarget;
        this.knownBlocks = new Set();
        vm.shareBlocksToTarget = function (blocks, id, fromId) {
            const target = byId(id);
            session.knownBlocks = new Set(target ? Object.keys(target.blocks._blocks) : []);
            return shareWrapper.call(vm, blocks, id, fromId);
        };

        // Extensions added from the extension library.
        const manager = vm.extensionManager;
        const originalLoad = manager.loadExtensionURL;
        this.originals.set('loadExtensionURL', {owner: manager, value: originalLoad, own: Object.prototype.hasOwnProperty.call(manager, 'loadExtensionURL')});
        manager.loadExtensionURL = function (url, ...rest) {
            const result = originalLoad.call(manager, url, ...rest);
            if (!session.remote) Promise.resolve(result).then(() => session.sendOp(() => ({kind: 'extension', url})), () => {});
            return result;
        };
    }

    // Mark the events of every redraw of the code area. ScratchBlocks may
    // load after the session starts, so this is retried until it's there.
    patchReload () {
        const Blockly = window.ScratchBlocks;
        if (this.originals.has('reload') || !Blockly || !Blockly.Xml || !Blockly.Events) return;
        const original = Blockly.Xml.clearWorkspaceAndLoadFromXml;
        this.originals.set('reload', {owner: Blockly.Xml, value: original});
        Blockly.Xml.clearWorkspaceAndLoadFromXml = function (...args) {
            const group = Blockly.Events.getGroup();
            Blockly.Events.setGroup(RELOAD_GROUP);
            try {
                return original.apply(this, args);
            } finally {
                Blockly.Events.setGroup(group);
            }
        };
    }

    uninstall () {
        for (const [name, {owner, value, own}] of this.originals) {
            if (name === 'blocklyListen') owner.blocklyListen = value;
            else if (name === 'reload') owner.clearWorkspaceAndLoadFromXml = value;
            else if (own === false) delete owner[name];
            else owner[name] = value;
        }
        this.originals.clear();
    }

    /* ---------------------------------------------- applying others' edits */

    find (key) {
        if (key === STAGE) return this.vm.runtime.getTargetForStage();
        return this.vm.runtime.targets.find(t => t.isOriginal && !t.isStage && t.sprite.name === key) || null;
    }

    // Run fn as though `target` were the one being edited (many VM methods
    // act on the editing target), without showing it in the workspace.
    withEditing (target, fn) {
        const vm = this.vm;
        if (target === vm.editingTarget) return fn();
        const previous = vm.editingTarget;
        const previousRuntime = vm.runtime._editingTarget;
        vm.editingTarget = target;
        vm.runtime._editingTarget = target;
        try {
            return fn();
        } finally {
            vm.editingTarget = previous;
            vm.runtime._editingTarget = previousRuntime;
        }
    }

    workspace () {
        const Blockly = window.ScratchBlocks || window.Blockly;
        return Blockly && Blockly.getMainWorkspace ? Blockly.getMainWorkspace() : null;
    }

    // Call fn marked as someone else's change, so the wrappers above don't
    // send it back out. Only the call itself is marked: edits this person
    // makes while, say, a costume downloads are still theirs. Blockly
    // delivers the events a change causes on a timer, so the mark lasts
    // until that timer has run.
    quiet (fn) {
        this.remote++;
        try {
            return fn();
        } finally {
            setTimeout(() => {
                this.remote--;
            }, 0);
        }
    }

    async apply (op) {
        const vm = this.vm;
        const target = op.target ? this.find(op.target) : null;
        const q = fn => this.quiet(fn);
        {
            switch (op.kind) {
            case 'block':
                if (target) this.applyBlockEvent(target, op);
                break;
            case 'addBlocks':
                if (!target) break;
                q(() => {
                    for (const block of op.blocks) target.blocks.createBlock(block);
                    target.blocks.updateTargetSpecificBlocks(target.isStage);
                    if (target === vm.editingTarget) vm.emitWorkspaceUpdate();
                });
                break;
            case 'replaceBlocks':
                if (!target) break;
                q(() => {
                    for (const id of Object.keys(target.blocks._blocks)) {
                        if (target.blocks._blocks[id] && target.blocks._blocks[id].topLevel) target.blocks.deleteBlock(id);
                    }
                    for (const block of Object.values(op.blocks)) target.blocks.createBlock(block);
                    target.blocks.resetCache();
                    if (target === vm.editingTarget) vm.emitWorkspaceUpdate();
                });
                break;
            case 'addSprite': {
                const editing = vm.editingTarget;
                await q(() => vm.addSprite(JSON.stringify(op.sprite)));
                if (editing) q(() => vm.setEditingTarget(editing.id));
                break;
            }
            case 'deleteSprite':
                if (target) q(() => vm.deleteSprite(target.id));
                break;
            case 'renameSprite': {
                const renamed = this.find(op.from);
                if (renamed) q(() => vm.renameSprite(renamed.id, op.to));
                break;
            }
            case 'reorderTarget':
                if (target) q(() => vm.reorderTarget(vm.runtime.targets.indexOf(target), op.to));
                break;
            case 'spriteInfo':
                if (target) {
                    q(() => {
                        target.postSpriteInfo(op.data);
                        vm.emitTargetsUpdate(false);
                    });
                }
                break;
            case 'addCostume':
                if (target) await q(() => vm.addCostume(op.costume.md5ext, Object.assign({}, op.costume), target.id));
                break;
            case 'insertCostume':
                if (target) {
                    await q(() => vm.addCostume(op.costume.md5ext, Object.assign({}, op.costume), target.id));
                    target.reorderCostume(target.getCostumes().length - 1, op.index);
                    vm.emitTargetsUpdate(false);
                }
                break;
            case 'renameCostume':
                if (target) q(() => this.withEditing(target, () => vm.renameCostume(op.index, op.name)));
                break;
            case 'deleteCostume':
                if (target) q(() => this.withEditing(target, () => vm.deleteCostume(op.index)));
                break;
            case 'reorderCostume':
                if (target) q(() => vm.reorderCostume(target.id, op.from, op.to));
                break;
            case 'paint':
                if (target) await this.applyPaint(target, op);
                break;
            case 'addSound':
                if (target) await q(() => vm.addSound(Object.assign({}, op.sound), target.id));
                break;
            case 'insertSound':
                if (target) {
                    await q(() => vm.addSound(Object.assign({}, op.sound), target.id));
                    target.reorderSound(target.getSounds().length - 1, op.index);
                    vm.emitTargetsUpdate(false);
                }
                break;
            case 'replaceSound':
                if (target) {
                    q(() => this.withEditing(target, () => vm.deleteSound(op.index)));
                    await q(() => vm.addSound(Object.assign({}, op.sound), target.id));
                    target.reorderSound(target.getSounds().length - 1, op.index);
                    vm.emitTargetsUpdate(false);
                }
                break;
            case 'renameSound':
                if (target) q(() => this.withEditing(target, () => vm.renameSound(op.index, op.name)));
                break;
            case 'deleteSound':
                if (target) q(() => this.withEditing(target, () => vm.deleteSound(op.index)));
                break;
            case 'reorderSound':
                if (target) q(() => vm.reorderSound(target.id, op.from, op.to));
                break;
            case 'extension': {
                const id = String(op.url);
                if (!vm.extensionManager.isExtensionLoaded(id)) await q(() => vm.extensionManager.loadExtensionURL(op.url));
                break;
            }
            }
        }
    }

    applyBlockEvent (target, op) {
        const vm = this.vm;
        const ws = this.workspace();
        const Blockly = window.ScratchBlocks || window.Blockly;
        // The target on screen: replay through Blockly so the workspace shows
        // it; the VM hears about it the usual way.
        if (op.json && op.json.type === 'change') this.endPreview(`${op.json.blockId}:${op.json.name}`);
        if (op.json && op.json.type === 'move') this.drags.delete(op.json.blockId);
        if (target === vm.editingTarget && ws && op.json && Blockly && Blockly.Events && Blockly.Events.fromJson) {
            // Someone else's edit isn't this person's to undo.
            const recordUndo = Blockly.Events.recordUndo;
            const group = Blockly.Events.getGroup();
            try {
                Blockly.Events.recordUndo = false;
                Blockly.Events.setGroup(REMOTE_GROUP);
                const event = Blockly.Events.fromJson(op.json, ws);
                event.run(true);
                return;
            } catch (e) {
                // Fall back to updating the VM and redrawing.
            } finally {
                Blockly.Events.setGroup(group);
                Blockly.Events.recordUndo = recordUndo;
            }
        }
        const event = Object.assign({}, op.event);
        if (event.xml) event.xml = new DOMParser().parseFromString(event.xml, 'text/xml').documentElement;
        this.remote++;
        try {
            this.withEditing(target, () => target.blocks.blocklyListen(event));
        } finally {
            this.remote--;
        }
        // A shared variable changes every sprite's palette, so redraw even
        // when the edit was to another sprite.
        const sharedVariable = /^var_/.test(event.type) && !event.isLocal;
        if (target === vm.editingTarget || sharedVariable) vm.emitWorkspaceUpdate();
    }

    async applyPaint (target, op) {
        const vm = this.vm;
        const c = op.costume;
        const asset = await storage.load(
            c.dataFormat === 'svg' ? storage.AssetType.ImageVector : storage.AssetType.ImageBitmap,
            c.assetId, c.dataFormat);
        if (!asset) return;
        if (c.dataFormat === 'svg') {
            const svg = new TextDecoder().decode(asset.data);
            this.quiet(() => this.withEditing(target, () => vm.updateSvg(op.index, svg, c.rotationCenterX, c.rotationCenterY)));
            return;
        }
        const image = await createImageBitmap(new Blob([asset.data], {type: `image/${c.dataFormat}`}));
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        const bitmap = context.getImageData(0, 0, image.width, image.height);
        this.quiet(() => this.withEditing(target, () => vm.updateBitmap(op.index, bitmap, c.rotationCenterX,
            c.rotationCenterY, c.bitmapResolution)));
    }

    /* ------------------------------------------ drags and typing, as they go */

    // What this person is doing right now that hasn't become an edit yet: a
    // block being dragged, or text being typed into a block.
    currentLive () {
        const ws = this.workspace();
        const Blockly = window.ScratchBlocks || window.Blockly;
        const editing = this.vm.editingTarget;
        if (!ws || !Blockly || !editing) return null;
        const target = targetKey(editing);
        const gesture = ws.currentGesture_;
        const dragger = gesture && gesture.blockDragger_;
        const block = dragger && dragger.draggingBlock_;
        if (block && block.workspace === ws && this.mouse) {
            // Only which block, and where it sits from the mouse: the others
            // move it along with this person's cursor.
            const rect = ws.getParentSvg().getBoundingClientRect();
            const mouseX = (this.mouse.x - rect.left - ws.scrollX) / ws.scale;
            const mouseY = (this.mouse.y - rect.top - ws.scrollY) / ws.scale;
            const xy = block.getRelativeToSurfaceXY();
            return {kind: 'drag', target, block: block.id,
                dx: Math.round(xy.x - mouseX), dy: Math.round(xy.y - mouseY)};
        }
        const input = Blockly.FieldTextInput && Blockly.FieldTextInput.htmlInput_;
        const field = Blockly.WidgetDiv && Blockly.WidgetDiv.owner_;
        const source = field && field.sourceBlock_;
        if (input && source && source.workspace === ws && field.name) {
            return {kind: 'field', target, block: source.id, name: field.name, value: input.value};
        }
        return null;
    }

    sendLive () {
        this.patchReload();
        if (this.remote) return;
        const live = this.currentLive();
        const key = JSON.stringify(live);
        if (key === this.lastLive) return;
        // Tell the others when it stops, so a half-typed preview goes away.
        const previous = this.lastLive ? JSON.parse(this.lastLive) : null;
        this.lastLive = key;
        if (live) this.rawSend({t: 'live', live});
        else if (previous) this.rawSend({t: 'live', live: {...previous, end: true}});
    }

    receiveLive (live, from) {
        if (!live || !this.vm.editingTarget || live.target !== targetKey(this.vm.editingTarget)) return;
        const ws = this.workspace();
        const block = ws && ws.getBlockById(String(live.block));
        if (!block) return;
        if (live.kind === 'drag') {
            if (live.end) this.drags.delete(block.id);
            else if (typeof live.dx === 'number' && typeof live.dy === 'number') {
                this.drags.set(block.id, {from, dx: live.dx, dy: live.dy});
            }
        } else if (live.kind === 'field') {
            const field = block.getField(String(live.name));
            if (!field) return;
            const key = `${block.id}:${field.name}`;
            if (live.end) {
                // No edit came of it (Esc, say): put the text back.
                setTimeout(() => this.endPreview(key), 500);
                return;
            }
            if (!this.previews.has(key)) this.previews.set(key, {field, text: field.getText()});
            field.setText(String(live.value).slice(0, 10000));
        }
    }

    // Blockly skips setting a field to the text it already shows, so the
    // preview comes off before the real change is applied.
    endPreview (key) {
        const preview = this.previews.get(key);
        if (!preview) return;
        this.previews.delete(key);
        preview.field.setText(preview.text);
    }

    // Move blocks others are dragging along with their cursors. Moved without
    // Blockly events: the VM learns the final place from the edit that
    // follows the drop.
    animateDrags (time) {
        const dt = Math.min(100, time - (this.lastDragFrame || time));
        this.lastDragFrame = time;
        this.dragFrame = requestAnimationFrame(t => this.animateDrags(t));
        if (!this.drags.size) return;
        const ws = this.workspace();
        const Blockly = window.ScratchBlocks || window.Blockly;
        if (!ws || !Blockly) return;
        const k = 1 - Math.exp(-dt / DRAG_EASE);
        for (const [id, drag] of this.drags) {
            const cursor = this.cursors.get(drag.from);
            if (!cursor || typeof cursor.x !== 'number') continue;
            const to = {x: cursor.x + drag.dx, y: cursor.y + drag.dy};
            const block = ws.getBlockById(id);
            if (!block || block.isInFlyout) {
                this.drags.delete(id);
                continue;
            }
            // Still attached until the unplug that started the drag arrives.
            if (block.getParent()) continue;
            const at = block.getRelativeToSurfaceXY();
            const dx = (to.x - at.x) * k;
            const dy = (to.y - at.y) * k;
            if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) continue;
            Blockly.Events.disable();
            try {
                block.moveBy(dx, dy);
            } finally {
                Blockly.Events.enable();
            }
        }
    }

    // The Python panel writes a sprite's blocks directly; send them whole.
    replaceBlocks (target) {
        if (!target) return;
        const key = targetKey(target);
        this.sendOp(() => ({kind: 'replaceBlocks', target: key, blocks: JSON.parse(JSON.stringify(target.blocks._blocks))}));
    }
}

export default CollabSession;
