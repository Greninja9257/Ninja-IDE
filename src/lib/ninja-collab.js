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
import MonitorRecord from 'scratch-vm/src/engine/monitor-record';

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
// How often the longest-connected editor sends round a fingerprint of every
// sprite, and how many checks in a row a sprite must differ on before it's
// copied over again. Copies are only compared when both have seen exactly
// the same edits (see appliedSeq), so a slow connection isn't a difference.
const DIGEST_INTERVAL = 3000;
const MISMATCHES_BEFORE_RESYNC = 2;

// A short fingerprint of a string (FNV-1a).
const hash = text => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
};

// What makes a sprite's code the same as someone else's: its blocks (not
// where exactly they sit, to a few pixels), its variables' names and its
// comments. Variable values change as the project runs, so they're left out.
const fingerprint = target => {
    const blocks = Object.values(target.blocks._blocks).map(b => [
        b.id, b.opcode, b.parent, b.next, b.shadow ? 1 : 0, b.topLevel ? 1 : 0,
        b.topLevel ? Math.round(b.x / 10) : '', b.topLevel ? Math.round(b.y / 10) : '',
        Object.values(b.fields || {}).map(f => `${f.name}=${f.value}@${f.id || ''}`).sort().join(','),
        Object.values(b.inputs || {}).map(i => `${i.name}:${i.block}:${i.shadow}`).sort().join(','),
        b.mutation ? JSON.stringify(b.mutation) : ''
    ].join('|')).sort();
    const variables = Object.values(target.variables).map(v => `${v.id}:${v.name}:${v.type}:${v.isCloud ? 1 : 0}`).sort();
    const comments = Object.values(target.comments || {}).map(c => `${c.id}:${c.blockId}:${c.text}`).sort();
    return hash(`${blocks.join('\n')}#${variables.join(',')}#${comments.join(',')}`);
};
const BLOCK_EVENTS = new Set([
    'create', 'delete', 'move', 'change',
    'var_create', 'var_rename', 'var_delete',
    'comment_create', 'comment_change', 'comment_move', 'comment_delete'
]);

const targetKey = target => (target.isStage ? STAGE : target.sprite.name);

// What about a monitor is someone's editing (not the value it shows).
const MONITOR_LAYOUT = ['visible', 'mode', 'x', 'y', 'width', 'height', 'sliderMin', 'sliderMax', 'isDiscrete'];

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
        this.outbox = []; // edits made while disconnected, sent on reconnecting
        this.wasLive = false;
        this.spriteDrag = null; // a sprite this person is dragging on the stage
        this.spriteGlides = new Map(); // sprite -> where someone is dragging it
        this.pendingOps = 0;
        this.applying = 0;
        // The server numbers every edit in the order it got them. appliedSeq
        // is the last number this copy includes: someone else's edit once
        // it's applied here, this person's own once the server has numbered
        // it. unacked: this person's edits sent but not numbered yet.
        this.appliedSeq = 0;
        this.unacked = new Set();
        this.nextCid = 1;
        this.mismatches = new Map();
        this.install();
        this.connect();
        this.liveTimer = setInterval(() => this.sendLive(), LIVE_INTERVAL);
        this.digestTimer = setInterval(() => this.sendDigest(), DIGEST_INTERVAL);
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
        // Until this editor has been live once, whatever it sees is the
        // project loading (or being replaced by everyone else's copy), not
        // edits; sending that would add a second copy of every script.
        if (this.remote || this.closed || !this.wasLive) return;
        this.pendingOps++;
        this.sendQueue = this.sendQueue
            .then(async () => {
                if (upload) await storeProjectAssets(storage, this.vm.assets);
                const op = await makeOp();
                if (!op) return;
                // Not connected right now: keep it for when we are again.
                if (this.ws && this.ws.readyState === 1 && !this.catchingUp) this.transmit(op);
                else this.outbox.push(op);
            })
            .catch(err => console.warn('collab: could not send a change', err)) // eslint-disable-line no-console
            .then(() => {
                this.pendingOps--;
            });
    }

    transmit (op) {
        const cid = this.nextCid++;
        this.unacked.add(cid);
        this.rawSend({t: 'op', cid, op});
    }

    // Moves appliedSeq on once everything before it in the queue is applied.
    reached (seq) {
        if (typeof seq !== 'number') return;
        this.applying++;
        this.applyQueue = this.applyQueue.then(() => {
            if (seq > this.appliedSeq) this.appliedSeq = seq;
            this.applying--;
        });
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
            this.mismatches.clear();
            // Sent on the last connection and never numbered: gone with it.
            this.unacked.clear();
            // Alone in the room: this copy is the project, nothing to resend.
            if (!this.catchingUp) {
                this.outbox = [];
                this.wasLive = true;
                this.appliedSeq = message.seq || 0;
            }
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
        case 'chat-rejected':
            // The comment filter turned our message away (and maybe muted us).
            if (this.handlers.onChatRejected) this.handlers.onChatRejected(message.rejected, message.mute_status);
            break;
        case 'snapshot-request':
            // Someone joined: send them the project as it is right now, with
            // every edit that reached this editor before they did applied, and
            // which edits it includes, so they apply each one exactly once.
            this.sendQueue = this.sendQueue.then(async () => {
                await storeProjectAssets(storage, this.vm.assets);
                await this.applyQueue;
                this.rawSend({t: 'snapshot', for: message.for, project: JSON.parse(this.vm.toJSON()),
                    seq: this.appliedSeq, mine: [...this.unacked]});
            }).catch(err => console.warn('collab: could not send the project', err)); // eslint-disable-line no-console
            break;
        case 'snapshot':
            this.applyQueue = this.applyQueue
                .then(() => this.loadSnapshot(message.project, message))
                .catch(err => console.warn('collab: could not load the live project', err)); // eslint-disable-line no-console
            break;
        case 'op':
            if (this.catchingUp) this.buffered.push(message);
            else this.enqueue(message.op, message.seq);
            break;
        case 'ack':
            // The server numbered (or, if seq is null, turned away) one of ours.
            this.unacked.delete(message.cid);
            this.reached(message.seq);
            break;
        case 'digest':
            this.checkDigest(message.from, message.digest, message.seq);
            break;
        case 'resync-request':
            this.sendResync(message.from, message.targets);
            break;
        case 'resync':
            this.applyQueue = this.applyQueue
                .then(() => this.applyResync(message.targets, message.seq))
                .catch(err => console.warn('collab: could not resync', err)); // eslint-disable-line no-console
            break;
        }
    }

    enqueue (op, seq) {
        this.applying++;
        this.applyQueue = this.applyQueue
            .then(() => this.apply(op))
            .catch(err => console.warn('collab: could not apply a change', op && op.kind, err)) // eslint-disable-line no-console
            .then(() => {
                if (typeof seq === 'number' && seq > this.appliedSeq) this.appliedSeq = seq;
                this.applying--;
            });
    }

    // from: who sent it, the last edit number it includes (seq), and which of
    // its sender's own edits, not numbered yet, are in it too (mine).
    async loadSnapshot (project, from = {}) {
        const editing = this.vm.editingTarget && targetKey(this.vm.editingTarget);
        try {
            await this.quiet(() => this.vm.loadProject(project));
        } catch (err) {
            // Usually an extension throwing as the project finishes loading;
            // the project itself is in. Carry on rather than stay stuck
            // catching up, with every later edit held back.
            console.warn('collab: loading the live project reported an error', err); // eslint-disable-line no-console
        }
        const again = editing && this.find(editing);
        if (again) this.quiet(() => this.vm.setEditingTarget(again.id));
        this.catchingUp = false;
        this.wasLive = true;
        this.handlers.onStatus('live');
        const seq = typeof from.seq === 'number' ? from.seq : 0;
        this.appliedSeq = seq;
        const included = new Set((Array.isArray(from.mine) ? from.mine : []).map(cid => `${from.from}:${cid}`));
        const pending = this.buffered;
        this.buffered = [];
        for (const message of pending) {
            if (typeof message.seq === 'number' && message.seq <= seq) continue;
            if (included.has(`${message.from}:${message.cid}`)) this.reached(message.seq);
            else this.enqueue(message.op, message.seq);
        }
        // Edits made while disconnected: redo them on top of the live
        // project, and send them to everyone else.
        const mine = this.outbox;
        this.outbox = [];
        for (const op of mine) {
            this.enqueue(op);
            this.transmit(op);
        }
    }

    /* ------------------------------------------------ staying the same */

    // The editor that has been connected longest is the reference copy.
    leaderId () {
        if (!this.me) return null;
        return Math.min(this.me.id, ...this.peers.keys());
    }

    // Mid-edit (a drag, typing, changes still going out or coming in): not a
    // fair moment to compare.
    busy () {
        return this.catchingUp || this.pendingOps > 0 || this.applying > 0 || this.unacked.size > 0 ||
            Boolean(this.currentLive());
    }

    digest () {
        const out = {};
        for (const target of this.vm.runtime.targets) {
            if (target.isOriginal) out[targetKey(target)] = fingerprint(target);
        }
        return out;
    }

    sendDigest () {
        if (!this.me || !this.peers.size || this.leaderId() !== this.me.id || this.busy()) return;
        this.rawSend({t: 'digest', digest: this.digest(), seq: this.appliedSeq});
    }

    checkDigest (from, theirs, seq) {
        if (from !== this.leaderId() || !theirs || typeof theirs !== 'object' || this.busy()) return;
        // Not the same edits seen yet (some still on their way to one of us):
        // any difference now is just that.
        if (seq !== this.appliedSeq) return;
        const mine = this.digest();
        const sameSprites = Object.keys(mine).sort().join('\n') === Object.keys(theirs).sort().join('\n');
        const differing = sameSprites ? Object.keys(mine).filter(key => mine[key] !== theirs[key]) : ['*'];
        for (const key of [...this.mismatches.keys()]) {
            if (!differing.includes(key)) this.mismatches.delete(key);
        }
        const ready = [];
        for (const key of differing) {
            const count = (this.mismatches.get(key) || 0) + 1;
            this.mismatches.set(key, count);
            if (count >= MISMATCHES_BEFORE_RESYNC) ready.push(key);
        }
        if (!ready.length) return;
        ready.forEach(key => this.mismatches.delete(key));
        this.rawSend({t: 'resync-request', to: from, targets: ready});
    }

    // Someone's copy of these sprites differs from this one: send them ours.
    sendResync (to, keys) {
        if (!Array.isArray(keys)) return;
        this.sendQueue = this.sendQueue.then(async () => {
            await storeProjectAssets(storage, this.vm.assets);
            await this.applyQueue;
            // Mid-edit here: this copy has something no edit number covers.
            // They'll ask again after the next check.
            if (this.unacked.size || this.pendingOps) return;
            const seq = this.appliedSeq;
            if (keys.includes('*')) {
                this.rawSend({t: 'resync', to, seq, targets: {'*': JSON.parse(this.vm.toJSON())}});
                return;
            }
            const targets = {};
            for (const key of keys) {
                const target = this.find(String(key));
                if (!target) continue;
                targets[key] = {
                    blocks: JSON.parse(JSON.stringify(target.blocks._blocks)),
                    variables: Object.values(target.variables).map(v => ({id: v.id, name: v.name, type: v.type,
                        isCloud: Boolean(v.isCloud)})),
                    comments: JSON.parse(JSON.stringify(target.comments || {}))
                };
            }
            this.rawSend({t: 'resync', to, seq, targets});
        }).catch(err => console.warn('collab: could not send a resync', err)); // eslint-disable-line no-console
    }

    async applyResync (targets, seq) {
        if (!targets || typeof targets !== 'object') return;
        // Only on top of exactly the edits it was made from: anything newer
        // here (theirs or ours) would be wiped out by it. The next check
        // catches the difference again if it's still there.
        if (seq !== this.appliedSeq || this.unacked.size || this.pendingOps) return;
        if (targets['*']) {
            await this.loadSnapshot(targets['*'], {seq});
            return;
        }
        const vm = this.vm;
        let redraw = false;
        for (const [key, data] of Object.entries(targets)) {
            const target = this.find(key);
            if (!target || !data || typeof data.blocks !== 'object') continue;
            this.quiet(() => {
                const blocks = target.blocks;
                blocks._blocks = {};
                blocks._scripts = [];
                for (const block of Object.values(data.blocks)) blocks.createBlock(block);
                blocks.resetCache();
                // Variables: same ids and names as theirs; values stay.
                const wanted = new Map((data.variables || []).map(v => [v.id, v]));
                for (const id of Object.keys(target.variables)) {
                    if (!wanted.has(id)) delete target.variables[id];
                }
                for (const v of wanted.values()) {
                    const have = target.variables[v.id];
                    if (!have) target.createVariable(v.id, v.name, v.type, v.isCloud);
                    else if (have.name !== v.name) have.name = v.name;
                }
                target.comments = {};
                for (const c of Object.values(data.comments || {})) {
                    target.createComment(c.id, c.blockId, c.text, c.x, c.y, c.width, c.height, c.minimized);
                }
                blocks.updateTargetSpecificBlocks(target.isStage);
            });
            if (target === vm.editingTarget || target.isStage) redraw = true;
        }
        if (redraw) this.quiet(() => vm.emitWorkspaceUpdate());
    }

    close () {
        this.closed = true;
        clearInterval(this.liveTimer);
        clearInterval(this.digestTimer);
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
            // Ticking a variable (or x position, ...) in the palette shows its
            // monitor. The palette is also re-ticked to match when a script
            // shows or hides one; then the monitor has already changed, so
            // only a tick that changes it is someone's doing.
            const checkbox = e && e.type === 'change' && e.element === 'checkbox' && this === vm.runtime.flyoutBlocks;
            const shownBefore = checkbox && session.monitorShown(e.blockId);
            const result = originalListen.call(this, e);
            if (checkbox && !session.remote && session.monitorShown(e.blockId) !== shownBefore) {
                session.sendMonitor(e.blockId);
            }
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
        this.installMonitors();

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
            // Loading a project "renames" every sprite to its own name.
            if (target && this.lastName !== target.sprite.name) {
                this.sendOp(() => ({kind: 'renameSprite', from: this.lastName, to: target.sprite.name}));
            }
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
        // Sprites dragged on the stage: sent live while dragging (see
        // moveSprite), then the exact spot once dropped. The sprite is
        // hidden locally while it's dragged; that isn't shared.
        this.spriteInfo = new Map();
        wrap('postSpriteInfo', ([data], before) => {
            if (vm._dragTarget) {
                if (typeof data.x === 'number' && typeof data.y === 'number') {
                    this.moveSprite(vm._dragTarget.id, data.x, data.y);
                }
                return;
            }
            const target = before.editing;
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
        wrap('stopDrag', ([id]) => {
            const target = byId(id);
            this.spriteDrag = null;
            if (target && !target.isStage) {
                this.sendOp(() => ({kind: 'spriteInfo', target: targetKey(target), data: {x: target.x, y: target.y}}));
            }
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

    // Monitors moved, resized, switched mode or hidden from their own menu.
    // (Scripts showing and hiding them go through requestShowMonitor and
    // requestHideMonitor, and values are updated all the time; neither is
    // someone editing, so neither is sent.)
    installMonitors () {
        const runtime = this.vm.runtime;
        const session = this;
        this.monitorInternal = 0;
        for (const prop of ['requestShowMonitor', 'requestHideMonitor']) {
            const original = runtime[prop];
            this.originals.set(`runtime.${prop}`, {owner: runtime, value: original, prop,
                own: Object.prototype.hasOwnProperty.call(runtime, prop)});
            runtime[prop] = function (...args) {
                session.monitorInternal++;
                try {
                    return original.apply(runtime, args);
                } finally {
                    session.monitorInternal--;
                }
            };
        }
        const originalUpdate = runtime.requestUpdateMonitor;
        this.originals.set('runtime.requestUpdateMonitor', {owner: runtime, value: originalUpdate,
            prop: 'requestUpdateMonitor', own: Object.prototype.hasOwnProperty.call(runtime, 'requestUpdateMonitor')});
        runtime.requestUpdateMonitor = function (delta) {
            const result = originalUpdate.call(runtime, delta);
            if (!session.remote && !session.monitorInternal && delta) {
                const js = MonitorRecord.externalDeltaToJS(delta);
                if (typeof js.id === 'string' && MONITOR_LAYOUT.some(key => typeof js[key] !== 'undefined')) {
                    session.sendMonitor(js.id);
                }
            }
            return result;
        };
    }

    monitorShown (id) {
        const record = this.vm.runtime._monitorState.get(id);
        return Boolean(record && record.visible);
    }

    // A monitor as it is now, for the others. Sprite-specific monitor ids
    // start with the sprite's id, which differs between editors, so that part
    // is sent as the sprite's name.
    sendMonitor (id) {
        this.sendOp(() => {
            const runtime = this.vm.runtime;
            const record = runtime._monitorState.get(id);
            if (!record) return null;
            const target = record.targetId ? runtime.getTargetById(record.targetId) : null;
            const sprite = target && !target.isStage ? targetKey(target) : null;
            const local = sprite && id.startsWith(record.targetId);
            const block = runtime.monitorBlocks.getBlock(id);
            const layout = {};
            for (const key of MONITOR_LAYOUT) layout[key] = record[key];
            return {
                kind: 'monitor',
                id: local ? id.slice(record.targetId.length) : id,
                sprite,
                local,
                opcode: record.opcode,
                params: record.params,
                layout,
                block: block ? JSON.parse(JSON.stringify(block)) : null
            };
        });
    }

    applyMonitor (op) {
        const runtime = this.vm.runtime;
        const target = op.sprite ? this.find(op.sprite) : null;
        if (op.sprite && !target) return;
        const id = op.local ? `${target.id}${op.id}` : op.id;
        this.quiet(() => {
            let block = runtime.monitorBlocks.getBlock(id);
            if (!block && op.block) {
                const copy = {...op.block, id};
                if (target) copy.targetId = target.id;
                runtime.monitorBlocks.createBlock(copy);
                block = runtime.monitorBlocks.getBlock(id);
            }
            if (block) block.isMonitored = Boolean(op.layout.visible);
            if (runtime._monitorState.has(id)) {
                runtime.requestUpdateMonitor({id, ...op.layout});
            } else {
                runtime.requestAddMonitor(new MonitorRecord({
                    id,
                    targetId: target ? target.id : null,
                    spriteName: target ? target.getName() : null,
                    opcode: op.opcode,
                    params: op.params,
                    ...op.layout
                }));
            }
            // Keep this person's palette tick in step.
            const ws = this.workspace();
            const flyout = ws && ws.getFlyout && ws.getFlyout();
            if (flyout && flyout.setCheckboxState) flyout.setCheckboxState(id, Boolean(op.layout.visible));
        });
    }

    // Someone typed into a list monitor, imported a list or moved a slider.
    // (Called from lib/variable-utils; scripts changing values aren't sent.)
    variableEdited (targetId, variableId, value) {
        if (this.remote) return;
        const target = targetId ? this.vm.runtime.getTargetById(targetId) : this.vm.runtime.getTargetForStage();
        if (!target) return;
        const copy = Array.isArray(value) ? value.slice() : value;
        this.sendOp(() => ({kind: 'variableValue', target: targetKey(target), id: variableId, value: copy}));
    }

    uninstall () {
        for (const [name, {owner, value, own, prop}] of this.originals) {
            if (name === 'blocklyListen') owner.blocklyListen = value;
            else if (name === 'reload') owner.clearWorkspaceAndLoadFromXml = value;
            else if (own === false) delete owner[prop || name];
            else owner[prop || name] = value;
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
        // Renaming or deleting a costume or sound tells the editor which sprite is
        // selected; held until the real one is back, or the palette and variables
        // would be built for the other sprite ("Stage selected").
        const emitTargetsUpdate = vm.emitTargetsUpdate;
        let held = null;
        vm.emitTargetsUpdate = (...args) => {
            held = args;
        };
        vm.editingTarget = target;
        vm.runtime._editingTarget = target;
        try {
            return fn();
        } finally {
            vm.editingTarget = previous;
            vm.runtime._editingTarget = previousRuntime;
            vm.emitTargetsUpdate = emitTargetsUpdate;
            if (held) vm.emitTargetsUpdate(...held);
        }
    }

    workspace () {
        const Blockly = window.ScratchBlocks || window.Blockly;
        return Blockly && Blockly.getMainWorkspace ? Blockly.getMainWorkspace() : null;
    }

    // Call fn marked as someone else's change, so the wrappers above don't
    // send it back out. Only the call itself is marked: edits this person
    // makes while, say, a costume downloads are still theirs. Blockly
    // delivers events on a timer, together with any this person made in the
    // meantime, so its events are marked by group instead, as they're made.
    quiet (fn) {
        const Blockly = window.ScratchBlocks || window.Blockly;
        const events = Blockly && Blockly.Events;
        const group = events && events.getGroup();
        this.remote++;
        if (events) events.setGroup(REMOTE_GROUP);
        try {
            return fn();
        } finally {
            if (events) events.setGroup(group);
            this.remote--;
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
                if (target) this.spriteGlides.delete(op.target);
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
            case 'monitor':
                this.applyMonitor(op);
                break;
            case 'variableValue': {
                const variable = target && target.variables[op.id];
                if (!variable) break;
                variable.value = Array.isArray(op.value) ? op.value.slice() : op.value;
                // Lists redraw their monitor only when told they changed.
                variable._monitorUpToDate = false;
                break;
            }
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
            // Someone else's edit never asks this person anything (deleting a
            // variable in use, say, would otherwise pop up a confirmation).
            const confirm = Blockly.confirm;
            const windowConfirm = window.confirm;
            try {
                Blockly.Events.recordUndo = false;
                Blockly.Events.setGroup(REMOTE_GROUP);
                Blockly.confirm = (message, callback) => callback(true);
                window.confirm = () => true;
                const event = Blockly.Events.fromJson(op.json, ws);
                event.run(true);
                // Blockly tells the VM on its next tick; tell it now, so the
                // VM has this edit by the time it counts as applied (and a
                // fingerprint or resync made then includes it).
                if (Blockly.Events.fireNow_) Blockly.Events.fireNow_();
                return;
            } catch (e) {
                // Fall back to updating the VM and redrawing.
            } finally {
                Blockly.confirm = confirm;
                window.confirm = windowConfirm;
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

    // Called by the stage while this person drags a sprite.
    moveSprite (targetId, x, y) {
        const target = this.vm.runtime.getTargetById(targetId);
        if (!target || target.isStage || this.remote) return;
        this.spriteDrag = {kind: 'sprite', target: targetKey(target), x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10};
    }

    sendLive () {
        this.patchReload();
        if (this.remote) return;
        if (this.spriteDrag) {
            const key = JSON.stringify(this.spriteDrag);
            if (key !== this.lastSpriteDrag) {
                this.lastSpriteDrag = key;
                this.rawSend({t: 'live', live: this.spriteDrag});
            }
        }
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
        if (live && live.kind === 'sprite') {
            const target = this.find(String(live.target));
            if (target && typeof live.x === 'number' && typeof live.y === 'number') {
                this.spriteGlides.set(targetKey(target), {x: live.x, y: live.y});
            }
            return;
        }
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
        this.animateSprites(dt);
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

    // Glide sprites others are dragging on the stage towards where they are.
    animateSprites (dt) {
        if (!this.spriteGlides.size) return;
        const k = 1 - Math.exp(-dt / DRAG_EASE);
        for (const [key, to] of this.spriteGlides) {
            const target = this.find(key);
            if (!target || this.vm._dragTarget === target) {
                this.spriteGlides.delete(key);
                continue;
            }
            const dx = to.x - target.x;
            const dy = to.y - target.y;
            if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) continue;
            target.setXY(target.x + (dx * k), target.y + (dy * k), true);
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
