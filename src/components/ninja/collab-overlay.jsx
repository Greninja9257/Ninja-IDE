import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import CollabSession from '../../lib/ninja-collab';
import {setCollabPeers} from '../../reducers/ninja-session';
import {getIsShowingWithId, getIsUpdating} from '../../reducers/project-state';
import styles from './collab-overlay.css';

const BLOCKS_TAB = 0;
const CHAT_SECONDS = 6;
// How many of one person's messages stay up at once, and how long one
// takes to fade out (matches the CSS).
const CHAT_STACK = 5;
const CHAT_FADE = 250;
let chatSeq = 0;
const CURSOR_INTERVAL = 50;
// How quickly a drawn cursor catches up with the latest position (ms).
const CURSOR_EASE = 60;

const blockly = () => window.ScratchBlocks || window.Blockly || null;
const mainWorkspace = () => {
    const B = blockly();
    return B && B.getMainWorkspace ? B.getMainWorkspace() : null;
};
const targetKey = target => (target.isStage ? '__stage__' : target.sprite.name);

// Somewhere text is being typed: Enter belongs to it, not to chat.
const isTyping = () => {
    const el = document.activeElement;
    if (!el || el === document.body) {
        const B = blockly();
        return Boolean(B && B.WidgetDiv && B.WidgetDiv.isVisible && B.WidgetDiv.isVisible());
    }
    return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
};

/**
 * Live collaboration on top of the editor: where everyone's mouse is in the
 * code area, and chat. Who's online is shown in the menu bar. Press Enter to open a message box at your
 * mouse, Enter to send, Esc to cancel. Messages show at the sender's cursor
 * for a few seconds. Other people's cursors are drawn on top and never
 * replace yours.
 */
class CollabOverlay extends React.Component {
    constructor (props) {
        super(props);
        this.state = {peers: [], me: null, cursors: {}, chats: [], composing: null, text: ''};
        this.mouse = {x: 0, y: 0};
        this.smooth = {}; // where each cursor is drawn, easing towards where it is
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleChange = this.handleChange.bind(this);
        this.handleInputKeyDown = this.handleInputKeyDown.bind(this);
        this.setInput = this.setInput.bind(this);
        this.sendView = this.sendView.bind(this);
        this.frame = this.frame.bind(this);
    }

    componentDidMount () {
        document.addEventListener('mousemove', this.handleMouseMove, true);
        document.addEventListener('keydown', this.handleKeyDown, true);
        this.props.vm.on('workspaceUpdate', this.sendView);
        this.maybeStart();
        this.raf = requestAnimationFrame(this.frame);
    }

    componentDidUpdate (prevProps) {
        if (prevProps.projectId !== this.props.projectId || prevProps.ready !== this.props.ready) this.maybeStart();
        if (prevProps.activeTab !== this.props.activeTab) this.sendView();
    }

    componentWillUnmount () {
        document.removeEventListener('mousemove', this.handleMouseMove, true);
        document.removeEventListener('keydown', this.handleKeyDown, true);
        this.props.vm.removeListener('workspaceUpdate', this.sendView);
        cancelAnimationFrame(this.raf);
        clearInterval(this.chatSweep);
        this.stop();
    }

    maybeStart () {
        const {vm, projectId, ready} = this.props;
        if (!ready || !projectId || projectId === '0') return this.stop();
        if (this.session && this.session.projectId === projectId) return;
        this.stop();
        this.session = new CollabSession(vm, projectId, {
            onPeers: (peers, me) => this.setState({peers, me: me || this.state.me}, () => {
                this.publishPeers();
                this.dropChatsOfAbsent();
            }),
            onStatus: status => {
                if (status !== 'live' && status !== 'catching-up') {
                    this.setState({peers: [], me: null}, () => {
                        this.publishPeers();
                        this.dropChatsOfAbsent();
                    });
                }
            },
            onCursor: (id, cursor) => {
                const before = this.state.cursors[id];
                this.setState(state => ({cursors: {...state.cursors, [id]: cursor}}), () => {
                    if ((before && before.target) !== (cursor && cursor.target)) this.publishPeers();
                });
            },
            // This person's own messages are shown as they send them.
            onChat: (person, text, cursor) => {
                if (person && !(this.state.me && person.id === this.state.me.id)) this.addChat(person, text, cursor);
            }
        });
        vm.ninjaCollab = this.session;
        this.chatSweep = setInterval(() => {
            const now = Date.now();
            // Expired messages fade out first, then go.
            if (this.state.chats.some(c => (c.leaving ? c.leaving + CHAT_FADE < now : c.until < now))) {
                this.setState(state => ({chats: state.chats
                    .filter(c => !c.leaving || c.leaving + CHAT_FADE >= now)
                    .map(c => (!c.leaving && c.until < now ? {...c, leaving: now} : c))}));
            }
        }, 100);
    }

    stop () {
        if (!this.session) return;
        this.session.close();
        this.props.onPeers([]);
        if (this.props.vm.ninjaCollab === this.session) delete this.props.vm.ninjaCollab;
        this.session = null;
    }

    // Everyone in the room, with the sprite each is on, for the menu bar's
    // online list and the badges on sprite tiles.
    publishPeers () {
        const {me, peers, cursors} = this.state;
        const target = this.props.vm.editingTarget;
        const everyone = (me ? [{...me, self: true, target: target ? targetKey(target) : null}] : []).concat(peers.map(p => ({
            ...p,
            target: cursors[p.id] ? cursors[p.id].target : null
        })));
        this.props.onPeers(this.session ? everyone : []);
    }

    /* --------------------------------------------------------- my cursor */

    // What this person is looking at (sprite, tab, scroll, zoom) so others
    // can jump to it, plus where the mouse is, in workspace units, wherever
    // it is on the page (over the palette or stage too, so a block being
    // dragged there keeps following it).
    cursorHere () {
        const target = this.props.vm.editingTarget;
        if (!target) return null;
        const view = {target: targetKey(target), tab: this.props.activeTab};
        const ws = mainWorkspace();
        if (!ws || this.props.activeTab !== BLOCKS_TAB) return view;
        view.scrollX = ws.scrollX;
        view.scrollY = ws.scrollY;
        view.scale = ws.scale;
        const svg = ws.getParentSvg && ws.getParentSvg();
        if (!svg || !svg.getBoundingClientRect) return view;
        const rect = svg.getBoundingClientRect();
        const {x, y} = this.mouse;
        if (!rect.width) return view;
        view.x = (x - rect.left - ws.scrollX) / ws.scale;
        view.y = (y - rect.top - ws.scrollY) / ws.scale;
        return view;
    }

    // Sprite or tab changed without the mouse moving.
    sendView () {
        if (!this.session) return;
        this.session.sendCursor(this.cursorHere());
        this.publishPeers();
    }

    handleMouseMove (e) {
        this.mouse = {x: e.clientX, y: e.clientY};
        if (!this.session) return;
        const now = Date.now();
        if (now - (this.lastCursorSent || 0) < CURSOR_INTERVAL) return;
        this.lastCursorSent = now;
        this.session.sendCursor(this.cursorHere());
    }

    // Where someone's cursor is drawn right now, on the screen.
    drawnAt (id) {
        return this.toScreen(this.smooth[id]);
    }

    // Workspace units back to the screen, for someone else's cursor.
    toScreen (cursor) {
        const ws = mainWorkspace();
        const target = this.props.vm.editingTarget;
        if (!cursor || typeof cursor.x !== 'number' || !ws || !target || this.props.activeTab !== BLOCKS_TAB || cursor.target !== targetKey(target)) return null;
        const svg = ws.getParentSvg && ws.getParentSvg();
        if (!svg) return null;
        const rect = svg.getBoundingClientRect();
        const x = rect.left + ws.scrollX + (cursor.x * ws.scale);
        const y = rect.top + ws.scrollY + (cursor.y * ws.scale);
        if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) return null;
        return {x, y};
    }

    // Ease each cursor towards its latest position, and keep them in place
    // while this person scrolls or zooms.
    frame (time) {
        const dt = Math.min(100, time - (this.lastFrame || time));
        this.lastFrame = time;
        const k = 1 - Math.exp(-dt / CURSOR_EASE);
        const {cursors} = this.state;
        for (const id of Object.keys(this.smooth)) {
            if (!cursors[id] || typeof cursors[id].x !== 'number') delete this.smooth[id];
        }
        for (const [id, cursor] of Object.entries(cursors)) {
            if (!cursor || typeof cursor.x !== 'number') continue;
            const drawn = this.smooth[id];
            if (!drawn || drawn.target !== cursor.target) {
                this.smooth[id] = {target: cursor.target, x: cursor.x, y: cursor.y};
            } else {
                drawn.x += (cursor.x - drawn.x) * k;
                drawn.y += (cursor.y - drawn.y) * k;
            }
        }
        if (Object.keys(cursors).length || this.state.chats.length || this.state.composing) this.forceUpdate();
        this.raf = requestAnimationFrame(this.frame);
    }

    /* --------------------------------------------------------------- chat */

    handleKeyDown (e) {
        if (!this.session || this.state.composing) return;
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || isTyping()) return;
        e.preventDefault();
        e.stopPropagation();
        this.setState({composing: {x: this.mouse.x, y: this.mouse.y}, text: ''});
    }

    setInput (input) {
        this.input = input;
        if (input) input.focus();
    }

    handleChange (e) {
        this.setState({text: e.target.value});
    }

    handleInputKeyDown (e) {
        e.stopPropagation();
        if (e.key === 'Escape') {
            this.setState({composing: null, text: ''});
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const text = this.state.text.trim();
            if (text && this.session) {
                const cursor = this.cursorHere();
                this.session.sendChat(text, cursor);
                // Takes the message box's place directly, without growing in.
                if (this.state.me) this.addChat(this.state.me, text.replace(/\s+/g, ' ').slice(0, 200), cursor, true);
            }
            this.setState({composing: null, text: ''});
        }
    }

    // Someone left (or this person lost the connection): fade out their
    // messages rather than leave them hanging in the corner.
    dropChatsOfAbsent () {
        const {peers, me} = this.state;
        const here = new Set(peers.map(p => p.id));
        if (me) here.add(me.id);
        const now = Date.now();
        if (!this.state.chats.some(c => !c.leaving && !here.has(c.person.id))) return;
        this.setState(state => ({
            chats: state.chats.map(c => (!c.leaving && !here.has(c.person.id) ? {...c, leaving: now} : c))
        }));
    }

    // Messages stack above the sender's cursor, newest at the bottom; past a
    // few, the oldest fade out.
    addChat (person, text, cursor, instant) {
        if (!person) return;
        const mine = this.state.me && person.id === this.state.me.id;
        const now = Date.now();
        this.setState(state => {
            const theirs = state.chats.filter(c => c.person.id === person.id && !c.leaving);
            const tooMany = theirs.slice(0, Math.max(0, theirs.length - CHAT_STACK + 1)).map(c => c.id);
            return {
                chats: state.chats
                    .map(c => (tooMany.includes(c.id) ? {...c, leaving: now} : c))
                    .concat({id: ++chatSeq, person, text, cursor, mine, instant, until: now + (CHAT_SECONDS * 1000)})
            };
        });
    }

    /* ------------------------------------------------------------- render */

    renderCursor (peer) {
        const at = this.drawnAt(peer.id);
        if (!at) return null;
        return (
            <div
                className={styles.cursor}
                key={`cursor-${peer.id}`}
                style={{transform: `translate(${at.x}px, ${at.y}px)`}}
            >
                <svg
                    className={styles.arrow}
                    height="20"
                    viewBox="0 0 16 20"
                    width="16"
                >
                    <path
                        d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z"
                        fill={peer.color}
                        stroke="#fff"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                    />
                </svg>
                <span
                    className={styles.name}
                    style={{background: peer.color}}
                >{peer.username}</span>
            </div>
        );
    }

    renderMessage (chat, last, named) {
        return (
            <div
                className={classNames(styles.message, {
                    [styles.instant]: chat.instant,
                    [styles.leaving]: chat.leaving
                })}
                key={chat.id}
            >
                <div className={styles.messageInner}>
                    <div className={classNames(styles.bubble, {[styles.tail]: last})}>
                        {named ? (
                            <span
                                className={styles.bubbleName}
                                style={{color: chat.person.color}}
                            >{chat.person.username}</span>
                        ) : null}
                        {chat.text}
                    </div>
                </div>
            </div>
        );
    }

    renderCompose () {
        return (
            <div
                className={styles.message}
                key="compose"
            >
                <div className={styles.messageInner}>
                    <div className={classNames(styles.bubble, styles.tail, styles.compose)}>
                        <input
                            className={styles.input}
                            maxLength={200}
                            placeholder="Say something"
                            ref={this.setInput}
                            value={this.state.text}
                            onBlur={() => this.setState({composing: null, text: ''})} // eslint-disable-line react/jsx-no-bind
                            onChange={this.handleChange}
                            onKeyDown={this.handleInputKeyDown}
                        />
                    </div>
                </div>
            </div>
        );
    }

    // One person's messages, stacked above and to the right of their cursor
    // (clear of the name label under it), moving with it.
    renderStack (id, at, chats, composing) {
        const items = chats.map((c, i) => this.renderMessage(c, !composing && i === chats.length - 1, false));
        if (composing) items.push(this.renderCompose());
        return (
            <div
                className={styles.stack}
                key={`stack-${id}`}
                style={{transform: `translate(${at.x + 4}px, ${at.y - 12}px) translateY(-100%)`}}
            >
                {items}
            </div>
        );
    }

    render () {
        const {peers, chats, composing, me} = this.state;
        const byPerson = new Map();
        for (const chat of chats) {
            if (!byPerson.has(chat.person.id)) byPerson.set(chat.person.id, []);
            byPerson.get(chat.person.id).push(chat);
        }
        const myId = me ? me.id : 'me';
        if (composing && !byPerson.has(myId)) byPerson.set(myId, []);
        const stacks = [];
        const cornered = [];
        for (const [id, list] of byPerson) {
            const mine = id === myId;
            const at = mine ? this.mouse : this.drawnAt(id);
            if (at) stacks.push(this.renderStack(id, at, list, mine && composing));
            else cornered.push(...list);
        }
        cornered.sort((a, b) => a.id - b.id);
        return (
            <div className={styles.overlay}>
                {peers.map(peer => this.renderCursor(peer))}
                {stacks}
                {cornered.length ? (
                    <div className={styles.cornerStack}>
                        {cornered.map(c => this.renderMessage(c, false, true))}
                    </div>
                ) : null}
            </div>
        );
    }
}

CollabOverlay.propTypes = {
    activeTab: PropTypes.number,
    onPeers: PropTypes.func,
    projectId: PropTypes.string,
    ready: PropTypes.bool,
    vm: PropTypes.object // eslint-disable-line react/forbid-prop-types
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm,
    activeTab: state.scratchGui.editorTab.activeTabIndex,
    // Saving passes through the updating states: stay connected through
    // them, or rejoining would load someone else's copy over this one.
    ready: getIsShowingWithId(state.scratchGui.projectState.loadingState) ||
        getIsUpdating(state.scratchGui.projectState.loadingState)
});

const mapDispatchToProps = dispatch => ({
    onPeers: peers => dispatch(setCollabPeers(peers))
});

export default connect(mapStateToProps, mapDispatchToProps)(CollabOverlay);
