import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import {Compartment, EditorState} from '@codemirror/state';
import {
    EditorView,
    drawSelection,
    dropCursor,
    highlightActiveLine,
    highlightActiveLineGutter,
    keymap,
    lineNumbers
} from '@codemirror/view';
import {defaultKeymap, history, historyKeymap, indentWithTab} from '@codemirror/commands';
import {
    HighlightStyle,
    bracketMatching,
    indentOnInput,
    indentUnit,
    syntaxHighlighting
} from '@codemirror/language';
import {python} from '@codemirror/lang-python';
import {autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap} from '@codemirror/autocomplete';
import {lintGutter, setDiagnostics} from '@codemirror/lint';
import {tags} from '@lezer/highlight';

import {
    blockIssues,
    emitExpr,
    generateNode,
    paletteEntries,
    pythonToNode,
    readInput,
    registerVmExtensions,
    reuseArgumentIds,
    scriptsToVm,
    vmToCustomBlocks,
    vmToScripts
} from '../../lib/ninja-pyc.js';
import AddonHooks from '../../addons/hooks.js';

import styles from './python-panel.css';

/** How long typing has to settle before the blocks are rewritten. */
const APPLY_DELAY = 400;

// scratch-blocks' own light palette, for keys the light theme leaves unset.
const LIGHT_SURFACES = {
    workspace: '#F9F9F9',
    flyout: '#F9F9F9',
    toolbox: '#FFFFFF',
    toolboxSelected: '#E9EEF2',
    toolboxText: '#575E75'
};

// The literal a dropped reporter should replace on a line: the one under the
// pointer, or failing that the only placeholder on the line (`if False:`).
const valueSlotAt = (text, column) => {
    const code = text.replace(/#.*$/, '');
    const pattern = /\b(?:True|False|None)\b|-?\b\d+(?:\.\d+)?\b|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g;
    const slots = [];
    let match;
    while ((match = pattern.exec(code)) !== null) slots.push({from: match.index, to: match.index + match[0].length});
    const under = slots.find(slot => column >= slot.from && column <= slot.to);
    if (under) return under;
    return slots.length === 1 ? slots[0] : null;
};

// Every block in a stack: the top block, what follows it, and everything in its inputs.
const stackIds = (blocks, root) => {
    const ids = [];
    const visit = id => {
        const block = id && blocks[id];
        if (!block || ids.includes(id)) return;
        ids.push(id);
        Object.values(block.inputs).forEach(input => {
            visit(input.block);
            visit(input.shadow);
        });
        visit(block.next);
    };
    visit(root);
    return ids;
};

// What a stack does, independent of block ids, so two copies of the same
// script compare equal. Custom block argument ids are regenerated on every
// write, so they are compared by position.
const stackSignature = (blocks, root) => {
    const ids = stackIds(blocks, root);
    const index = new Map(ids.map((id, i) => [id, i]));
    const ref = id => (id ? index.get(id) : null);
    return JSON.stringify(ids.map(id => {
        const block = blocks[id];
        const mutation = block.mutation || {};
        let argIds = [];
        try {
            argIds = JSON.parse(mutation.argumentids || '[]');
        } catch (e) {
            argIds = [];
        }
        const key = name => (argIds.includes(name) ? `arg${argIds.indexOf(name)}` : name);
        return [
            block.opcode,
            block.shadow,
            ref(block.next),
            Object.keys(block.inputs).map(name => [
                key(name), ref(block.inputs[name].block), ref(block.inputs[name].shadow)
            ])
                .sort(),
            Object.keys(block.fields).sort()
                .map(name => [name, block.fields[name].value]),
            Object.keys(mutation).filter(k => k !== 'children' && k !== 'argumentids')
                .sort()
                .map(k => [k, String(mutation[k])])
        ];
    }));
};

const isExpression = entry => entry.shape === 'reporter' || entry.shape === 'boolean';

// An entry's first line: the decorator for hats, the header for control blocks.
const chipText = entry => entry.snippet.split('\n')[0];

const surfaces = theme => Object.assign({}, LIGHT_SURFACES, theme.isDark() ? theme.getBlockColors() : {});

// Editor chrome and syntax colours from the current theme. Syntax colours are
// the block category colours, so `while` is Control orange and `self.move` is
// Motion blue in both views.
const themeExtensions = theme => {
    const colors = theme.getBlockColors();
    const dark = theme.isDark();
    const surface = surfaces(theme);
    const tone = key => (dark ? colors[key].primary : colors[key].tertiary);
    const text = dark ? '#E8E8E8' : '#383A42';
    return [
        EditorView.theme({
            '&': {
                height: '100%',
                color: text,
                backgroundColor: surface.workspace,
                fontSize: '.8125rem'
            },
            '.cm-scroller': {
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                lineHeight: '1.375rem'
            },
            '.cm-content': {caretColor: text, padding: '.5rem 0'},
            '.cm-gutters': {
                backgroundColor: surface.toolbox,
                color: surface.toolboxText,
                borderRight: `1px solid ${dark ? 'rgba(255, 255, 255, .15)' : 'rgba(0, 0, 0, .15)'}`
            },
            '.cm-activeLine': {backgroundColor: dark ? 'rgba(255, 255, 255, .04)' : 'rgba(0, 0, 0, .03)'},
            '.cm-activeLineGutter': {backgroundColor: surface.toolboxSelected},
            '&.cm-focused': {outline: 'none'},
            '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
                backgroundColor: dark ? 'rgba(76, 151, 255, .35)' : 'rgba(76, 151, 255, .25)'
            },
            '.cm-tooltip': {
                backgroundColor: surface.contextMenuBackground || '#FFFFFF',
                color: surface.contextMenuForeground || text,
                border: `1px solid ${surface.contextMenuBorder || 'rgba(0, 0, 0, .15)'}`,
                borderRadius: '.25rem'
            },
            '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
                backgroundColor: colors.motion.primary,
                color: '#FFFFFF'
            },
            '.cm-completionDetail': {opacity: '.6', fontStyle: 'normal'}
        }, {dark}),
        syntaxHighlighting(HighlightStyle.define([
            {
                tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.operatorKeyword],
                color: tone('control'),
                fontWeight: 'bold'
            },
            {tag: [tags.bool, tags.null], color: tone('control')},
            {tag: tags.meta, color: tone('event')},
            {
                tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.propertyName],
                color: tone('motion')
            },
            {tag: [tags.self, tags.className, tags.definition(tags.className)], color: tone('looks')},
            {tag: tags.string, color: tone('operators')},
            {tag: tags.number, color: tone('data')},
            {tag: tags.comment, color: dark ? '#8A8F98' : '#A0A1A7', fontStyle: 'italic'}
        ]))
    ];
};

/**
 * The Python view of the selected sprite.
 *
 * Always shows whichever target the sprite pane has selected — there is no
 * separate file list, because the sprite pane is already that list.
 *
 * The text and the blocks are the same thing, so there is no apply step:
 * typing rewrites the blocks as soon as what you have typed parses. Code that
 * does not parse yet is simply not written, and the blocks keep their last
 * good state.
 *
 * The palette is the block editor's own: this panel sits beside its flyout,
 * and a block dropped here becomes the Python it stands for.
 */
class PythonPanel extends React.Component {
    constructor (props) {
        super(props);
        // The editor is a layer inside the block editor's own container: above
        // its workspace, below its palette and drag layer. The workspace is
        // covered, not hidden, so nothing it draws can show through.
        this.host = document.createElement('div');
        this.host.className = styles.host;
        /** Set while this panel is the one rewriting blocks, so the resulting
         *  workspace update does not bounce back and reformat what is being
         *  typed. */
        this.applying = false;
        /** Set while the document is replaced from the blocks, so that change
         *  is not written straight back. */
        this.loading = false;
        /** The block being dragged out of the palette, while it is. */
        this.dropping = null;
        /** True while the text has edits that have not been written to blocks
         *  yet (still typing, or it does not parse). The blocks must not
         *  overwrite them. */
        this.dirty = false;
        /** Which sprite and variables the text was generated for. */
        this.vmKey = null;
        this.pointer = {x: 0, y: 0};
        this.themeCompartment = new Compartment();
        this.handleVmUpdate = this.handleVmUpdate.bind(this);
        this.handleWorkspaceChange = this.handleWorkspaceChange.bind(this);
        this.handleExtensionsChanged = this.handleExtensionsChanged.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.measure = this.measure.bind(this);
        this.completions = this.completions.bind(this);
    }

    componentDidMount () {
        this.view = new EditorView({
            parent: this.host,
            state: EditorState.create({
                doc: '',
                extensions: [
                    lineNumbers(),
                    highlightActiveLineGutter(),
                    lintGutter(),
                    history(),
                    drawSelection(),
                    dropCursor(),
                    indentOnInput(),
                    bracketMatching(),
                    closeBrackets(),
                    highlightActiveLine(),
                    indentUnit.of('    '),
                    EditorState.tabSize.of(4),
                    python(),
                    autocompletion({override: [this.completions]}),
                    keymap.of([
                        ...closeBracketsKeymap,
                        ...defaultKeymap,
                        ...historyKeymap,
                        ...completionKeymap,
                        indentWithTab
                    ]),
                    this.themeCompartment.of(themeExtensions(this.props.theme)),
                    EditorView.updateListener.of(update => {
                        if (update.docChanged && !this.loading) {
                            this.dirty = true;
                            this.scheduleApply();
                        }
                    })
                ]
            })
        });
        this.props.vm.on('targetsUpdate', this.handleVmUpdate);
        this.props.vm.on('workspaceUpdate', this.handleVmUpdate);
        this.props.vm.on('EXTENSION_ADDED', this.handleExtensionsChanged);
        this.props.vm.on('BLOCKSINFO_UPDATE', this.handleExtensionsChanged);
        document.addEventListener('pointermove', this.handlePointerMove, true);
        document.addEventListener('mousemove', this.handlePointerMove, true);
        window.addEventListener('resize', this.measure);
        this.registerExtensions();
        this.regenerate();
        this.connectToWorkspace();
    }

    componentDidUpdate (prevProps) {
        this.attachWorkspaceListener();
        if (prevProps.theme !== this.props.theme) {
            this.view.dispatch({effects: this.themeCompartment.reconfigure(themeExtensions(this.props.theme))});
        }
        if (this.props.isVisible !== prevProps.isVisible) this.showHost();
        if (this.props.isVisible && !prevProps.isVisible) {
            this.regenerate();
            this.connectToWorkspace();
            this.view.requestMeasure();
        }
    }

    componentWillUnmount () {
        clearTimeout(this.timer);
        clearTimeout(this.regenerateTimer);
        clearTimeout(this.finishApplyingTimer);
        clearTimeout(this.connectTimer);
        clearTimeout(this.dropCheckTimer);
        if (this.workspace) this.workspace.removeChangeListener(this.handleWorkspaceChange);
        if (this.flyoutObserver) this.flyoutObserver.disconnect();
        this.props.vm.off('targetsUpdate', this.handleVmUpdate);
        this.props.vm.off('workspaceUpdate', this.handleVmUpdate);
        this.props.vm.off('EXTENSION_ADDED', this.handleExtensionsChanged);
        this.props.vm.off('BLOCKSINFO_UPDATE', this.handleExtensionsChanged);
        document.removeEventListener('pointermove', this.handlePointerMove, true);
        document.removeEventListener('mousemove', this.handlePointerMove, true);
        window.removeEventListener('resize', this.measure);
        this.view.destroy();
        this.host.remove();
    }

    /**
     * The block editor mounts after this panel, and again whenever the theme
     * changes, so keep looking for it rather than assuming it is there.
     */
    connectToWorkspace () {
        clearTimeout(this.connectTimer);
        this.attachWorkspaceListener();
        this.mountHost();
        if (!this.workspace || !this.measure()) {
            this.connectTimer = setTimeout(() => this.connectToWorkspace(), 100);
        }
    }

    mountHost () {
        const injection = this.workspace && this.workspace.getInjectionDiv();
        if (!injection) return;
        if (this.host.parentNode !== injection) injection.appendChild(this.host);
        this.showHost();
        this.measure();
    }

    showHost () {
        this.host.style.display = this.props.isVisible ? '' : 'none';
        if (this.props.isVisible) this.view.requestMeasure();
    }

    // Start the editor at the right edge of the block palette's flyout; false
    // until the flyout exists.
    measure () {
        const injection = this.host.parentNode;
        const flyout = injection && injection.querySelector('.blocklyFlyout');
        if (!flyout) return false;
        if (flyout !== this.observedFlyout && typeof ResizeObserver !== 'undefined') {
            if (this.flyoutObserver) this.flyoutObserver.disconnect();
            this.flyoutObserver = new ResizeObserver(this.measure);
            this.flyoutObserver.observe(flyout);
            this.observedFlyout = flyout;
        }
        const left = Math.round(flyout.getBoundingClientRect().right - injection.getBoundingClientRect().left);
        if (left <= 0) return false;
        this.host.style.left = `${left}px`;
        return true;
    }

    handlePointerMove (event) {
        this.pointer = {x: event.clientX, y: event.clientY};
    }

    /** Describe the editor's loaded extensions to the transpiler, from the VM's own block info. */
    registerExtensions () {
        const parser = new DOMParser();
        const extensions = this.props.vm.runtime._blockInfo.map(category => ({
            id: category.id,
            blocks: category.blocks
                .filter(block => block.info && block.info.opcode && block.xml)
                .map(block => {
                    const root = parser.parseFromString(block.xml, 'text/xml').documentElement;
                    const inputs = {};
                    const fields = {};
                    for (const child of Array.from(root.children)) {
                        const name = child.getAttribute('name');
                        if (child.tagName === 'value') {
                            const shadow = child.querySelector('shadow');
                            const field = shadow && shadow.querySelector('field');
                            inputs[name] = {};
                            if (shadow) inputs[name].shadow = shadow.getAttribute('type');
                            if (field) {
                                inputs[name].field = field.getAttribute('name');
                                inputs[name].default = field.textContent;
                            }
                        } else if (child.tagName === 'field') {
                            fields[name] = {default: child.textContent};
                        }
                    }
                    return {
                        opcode: block.info.opcode,
                        blockType: block.info.blockType,
                        isTerminal: block.info.isTerminal,
                        argOrder: Object.keys(block.info.arguments || {}),
                        inputs,
                        fields
                    };
                })
        }));
        registerVmExtensions(extensions);
    }

    handleExtensionsChanged () {
        this.registerExtensions();
        this.regenerate();
    }

    attachWorkspaceListener () {
        const workspace = AddonHooks.blocklyWorkspace;
        if (!workspace || workspace === this.workspace) return;
        if (this.workspace) this.workspace.removeChangeListener(this.handleWorkspaceChange);
        this.workspace = workspace;
        this.workspace.addChangeListener(this.handleWorkspaceChange);
        this.mountHost();
    }

    handleWorkspaceChange (event) {
        if (!event) return;
        if (this.props.isVisible) {
            // In Python view the workspace is hidden, so a new block can only
            // be one pulled out of the palette (or made by a dialog, which is
            // never dragged). Hold regeneration until it lands.
            if (event.type === 'create' && !this.applying && !this.dropping) {
                const id = event.blockId;
                this.dropping = id;
                // What the blocks were before this drag, without the new block.
                this.dropIds = new Set(event.ids || [id]);
                const current = this.props.vm.editingTarget.blocks._blocks;
                this.dropSnapshot = JSON.parse(JSON.stringify(Object.fromEntries(
                    Object.entries(current).filter(([blockId]) => !this.dropIds.has(blockId))
                )));
                clearTimeout(this.dropCheckTimer);
                this.dropCheckTimer = setTimeout(() => {
                    if (this.dropping === id && !this.workspace.isDragging()) {
                        this.dropping = null;
                        this.regenerate();
                    }
                }, 300);
                return;
            }
            if (event.type === 'endDrag' && this.dropping && event.blockId === this.dropping) {
                const id = this.dropping;
                this.dropping = null;
                this.handleDrop(id);
                return;
            }
            if (this.dropping) return;
        }
        if (this.applying || event.isUiEvent) return;
        clearTimeout(this.regenerateTimer);
        this.regenerateTimer = setTimeout(() => this.regenerate(), 0);
    }

    /**
     * `targetsUpdate` fires every frame while the project runs, so only react
     * when the selected sprite or its variables actually change.
     */
    handleVmUpdate () {
        this.attachWorkspaceListener();
        if (this.applying || this.dropping) return;
        const target = this.props.vm.editingTarget;
        const stage = this.props.vm.runtime.getTargetForStage();
        const names = owner => (owner ? Object.values(owner.variables).map(v => `${v.type}:${v.name}`)
            .join(',') : '');
        const key = target ? `${target.id}|${names(target)}|${names(stage)}` : '';
        if (key === this.vmKey) return;
        const switched = !this.vmKey || !target || !this.vmKey.startsWith(`${target.id}|`);
        this.vmKey = key;
        this.regenerate(switched);
    }

    variableScopes () {
        const stage = this.props.vm.runtime.getTargetForStage();
        const stageVars = stage ? Object.values(stage.variables) : [];
        const targetVars = this.props.vm.editingTarget ? Object.values(this.props.vm.editingTarget.variables) : [];
        return {
            globalNames: new Set(stageVars.filter(v => v.type !== 'list').map(v => v.name)),
            listNames: new Set(stageVars.concat(targetVars)
                .filter(v => v.type === 'list')
                .map(v => v.name))
        };
    }

    nodeForTarget () {
        const target = this.props.vm.editingTarget;
        if (!target) return null;
        const {globalNames, listNames} = this.variableScopes();
        const blocks = target.blocks._blocks;
        return {
            id: target.id,
            name: target.getName(),
            type: target.isStage ? 'Stage' : 'Sprite2D',
            props: {},
            children: [],
            scripts: vmToScripts(blocks, {globalNames, listNames}),
            customBlocks: vmToCustomBlocks(blocks, {globalNames, listNames}),
            variables: Object.values(target.variables).map(v => ({
                id: v.id,
                name: v.name,
                scope: 'sprite',
                kind: v.type === 'list' ? 'list' : 'scalar',
                value: v.value
            })),
            costumes: [],
            sounds: [],
            currentCostume: 0,
            visible: true
        };
    }

    // Show the blocks as Python. Unwritten edits win over the blocks unless
    // `force` (a different sprite was selected, so they belong elsewhere).
    regenerate (force) {
        if (this.dirty && !force) return;
        const node = this.nodeForTarget();
        if (!node || !this.view) return;
        clearTimeout(this.timer);
        this.dirty = false;
        const code = generateNode(node).code;
        const current = this.view.state.doc.toString();
        if (code === current) return;
        // Replace only the part that differs, so the text does not flash and
        // the cursor and scroll position stay where they were.
        let start = 0;
        while (start < code.length && start < current.length && code[start] === current[start]) start++;
        let end = 0;
        while (end < code.length - start && end < current.length - start &&
            code[code.length - 1 - end] === current[current.length - 1 - end]) end++;
        this.loading = true;
        try {
            this.view.dispatch({
                changes: {from: start, to: current.length - end, insert: code.slice(start, code.length - end)}
            });
            this.view.dispatch(setDiagnostics(this.view.state, []));
        } finally {
            this.loading = false;
        }
    }

    scheduleApply () {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.apply(this.view.state.doc.toString()), APPLY_DELAY);
    }

    // Write the Python back into blocks. Half-typed code is the normal state
    // of a text editor, so a parse error only marks the line; the blocks are
    // left alone until it parses. Lines with no block equivalent stop the
    // write too, or they would be lost from both views.
    apply (source) {
        const target = this.props.vm.editingTarget;
        if (!target) return false;

        const node = this.nodeForTarget();
        const {globalNames, listNames} = this.variableScopes();
        const report = pythonToNode(node, source, {listNames, globalNames});
        const problems = report.errors.length ? report.errors : blockIssues(report, source);

        if (problems.length) {
            const doc = this.view.state.doc;
            this.view.dispatch(setDiagnostics(this.view.state, problems.map(error => {
                const line = doc.line(Math.max(1, Math.min(error.line, doc.lines)));
                return {from: line.from, to: line.to, severity: 'error', message: error.message};
            })));
            return false;
        }
        this.view.dispatch(setDiagnostics(this.view.state, []));
        this.dirty = false;

        const variableIds = new Map();
        const listIds = new Map();
        const stage = this.props.vm.runtime.getTargetForStage();
        for (const owner of [stage, target]) {
            if (!owner) continue;
            for (const variable of Object.values(owner.variables)) {
                (variable.type === 'list' ? listIds : variableIds).set(variable.name, variable.id);
            }
        }

        const blocks = scriptsToVm(report.node.scripts, {
            variableIds,
            listIds,
            customBlocks: reuseArgumentIds(report.node.customBlocks, target.blocks._blocks)
        });

        this.writeBlocks(blocks);
        return true;
    }

    // Make the sprite's blocks equal `blocks`, touching only stacks that
    // differ: rewriting everything would kill running scripts and lose what
    // the editor has selected.
    writeBlocks (blocks) {
        const store = this.props.vm.editingTarget.blocks;
        clearTimeout(this.finishApplyingTimer);
        this.applying = true;
        try {
            const existing = store._blocks;
            const oldRoots = Object.keys(existing).filter(id => existing[id].topLevel && !existing[id].shadow);
            const newRoots = Object.keys(blocks).filter(id => blocks[id].topLevel && !blocks[id].shadow);
            const unmatchedOld = new Map(oldRoots.map(id => [id, stackSignature(existing, id)]));
            const toCreate = [];
            for (const root of newRoots) {
                const signature = stackSignature(blocks, root);
                const same = [...unmatchedOld].find(([, sig]) => sig === signature);
                if (same) unmatchedOld.delete(same[0]);
                else toCreate.push(root);
            }
            // A stack that changed keeps its top block's id, so a script that
            // is running keeps its highlight.
            const renames = new Map();
            for (const root of toCreate) {
                const reuse = [...unmatchedOld.keys()].find(id => existing[id].opcode === blocks[root].opcode &&
                    ![...renames.values()].includes(id));
                if (reuse) renames.set(root, reuse);
            }
            for (const id of unmatchedOld.keys()) store.deleteBlock(id);
            const rename = id => renames.get(id) || id;
            for (const root of toCreate) {
                for (const id of stackIds(blocks, root)) {
                    const block = blocks[id];
                    const inputs = {};
                    for (const [name, input] of Object.entries(block.inputs)) {
                        inputs[name] = Object.assign({}, input, {
                            block: input.block && rename(input.block),
                            shadow: input.shadow && rename(input.shadow)
                        });
                    }
                    store.createBlock(Object.assign({}, block, {
                        id: rename(id),
                        parent: block.parent && rename(block.parent),
                        next: block.next && rename(block.next),
                        inputs
                    }));
                }
            }
            store.resetCache();
            this.props.vm.emitWorkspaceUpdate();
            this.props.vm.emitTargetsUpdate();
        } finally {
            // Loading the regenerated XML into Blockly emits follow-up change
            // events after emitWorkspaceUpdate returns. Keep those internal
            // events from being mistaken for a manual block edit.
            this.finishApplyingTimer = setTimeout(() => {
                this.applying = false;
                // My Blocks and variables are generated from the workspace; the
                // editor only rebuilds them after its own dialogs (and keeps
                // Blockly's automatic refresh switched off), so ask here.
                const toolbox = this.workspace && this.workspace.getToolbox();
                if (toolbox && !this.workspace.isDragging()) toolbox.refreshSelection();
            }, 100);
        }
    }

    // The Python for the blocks a drag created, and how it should be placed.
    pythonForStack (rootId, ids) {
        const all = this.props.vm.editingTarget.blocks._blocks;
        const subset = {};
        const collect = id => {
            const block = all[id];
            // Only what was dragged: if it snapped onto a script underneath,
            // that script is not part of it.
            if (!block || subset[id] || !ids.has(id)) return;
            subset[id] = Object.assign({}, block);
            Object.values(block.inputs).forEach(input => {
                collect(input.block);
                collect(input.shadow);
            });
            collect(block.next);
        };
        collect(rootId);
        if (!subset[rootId]) return null;
        subset[rootId] = Object.assign({}, subset[rootId], {parent: null, topLevel: true});
        const {globalNames, listNames} = this.variableScopes();
        const ctx = {globalNames, listNames};

        const block = this.workspace.getBlockById(rootId);
        if (block && block.outputConnection) {
            const expr = readInput({name: 'VALUE', block: rootId, shadow: null}, subset, ctx);
            return expr ? {kind: 'expression', text: emitExpr(expr)} : null;
        }
        const scripts = vmToScripts(subset, ctx);
        if (!scripts.length) return null;
        const node = Object.assign(this.nodeForTarget(), {scripts, customBlocks: [], variables: []});
        const lines = generateNode(node).code.replace(/\s+$/, '')
            .split('\n')
            .slice(1);
        if (scripts[0].hat.op === 'hat.none') {
            const body = lines.slice(lines.findIndex(l => l.trim().startsWith('def ')) + 1);
            return {kind: 'statement', text: body.map(l => l.slice(8)).join('\n')};
        }
        const start = lines.findIndex(l => l.trim());
        return {
            kind: 'hat',
            text: lines.slice(start).map(l => l.slice(4))
                .join('\n')
        };
    }

    // A block from the palette was let go. The blocks go back to exactly how
    // they were before the drag, and if it landed on the code, its Python is
    // added there and written from the text like any other edit.
    handleDrop (rootId) {
        const rect = this.host.getBoundingClientRect();
        const {x, y} = this.pointer;
        const inside = this.props.isVisible &&
            x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        const code = inside ? this.pythonForStack(rootId, this.dropIds) : null;

        this.writeBlocks(this.dropSnapshot);
        this.dropSnapshot = null;
        this.dropIds = null;

        if (code) {
            const pos = this.view.posAtCoords({x, y}) ?? this.view.state.doc.length;
            this.insertPython(code, pos);
            clearTimeout(this.timer);
            this.apply(this.view.state.doc.toString());
        }
    }

    // Put Python into the code where it was dropped, the way a block snaps
    // into place: a reporter fills the value slot it lands on, a statement
    // joins the body it lands in, and an event handler is a new method.
    insertPython ({kind, text}, pos) {
        const {state} = this.view;
        const doc = state.doc;
        let changes;
        let anchor;
        if (kind === 'expression') {
            const line = doc.lineAt(pos);
            const slot = valueSlotAt(line.text, pos - line.from);
            if (slot) {
                changes = {from: line.from + slot.from, to: line.from + slot.to, insert: text};
                anchor = line.from + slot.from + text.length;
            } else {
                const at = Math.max(pos, line.from + /^\s*/.exec(line.text)[0].length);
                changes = {from: at, insert: text};
                anchor = at + text.length;
            }
        } else if (kind === 'hat') {
            const end = doc.toString().replace(/\s+$/, '').length;
            const method = text.split('\n')
                .map(l => (l ? `    ${l}` : l))
                .join('\n');
            const insert = `\n\n${method}\n`;
            changes = [{from: end, to: doc.length, insert}];
            anchor = end + insert.length - 1;
            // A class that only said `pass` does not need it once it has a method.
            const second = doc.lines >= 2 ? doc.line(2) : null;
            const onlyPass = second && second.text.trim() === 'pass' &&
                !doc.sliceString(second.to).trim();
            if (onlyPass) {
                changes.unshift({from: doc.line(1).to, to: second.to, insert: ''});
                anchor -= second.to - doc.line(1).to;
            }
        } else {
            // Anchor on the nearest code at or above the drop point.
            let line = doc.lineAt(pos);
            while (line.number > 1 && !line.text.trim()) line = doc.line(line.number - 1);
            const trimmed = line.text.trim();
            let indent = /^\s*/.exec(line.text)[0];
            if (trimmed.startsWith('@')) {
                // A decorator: go into the method it decorates.
                while (line.number < doc.lines && !doc.line(line.number).text.trim()
                    .startsWith('def ')) line = doc.line(line.number + 1);
                indent = `${/^\s*/.exec(line.text)[0]}    `;
            } else if (trimmed.endsWith(':')) {
                indent += '    ';
            }
            const body = text.split('\n').join(`\n${indent}`);
            const next = line.number < doc.lines ? doc.line(line.number + 1) : null;
            if (next && next.text.trim() === 'pass' && /^\s*/.exec(next.text)[0] === indent) {
                // An empty body's `pass` is replaced, not kept beside the new code.
                changes = {from: next.from, to: next.to, insert: indent + body};
                anchor = next.from + indent.length + body.length;
            } else if (trimmed === 'pass') {
                changes = {from: line.from, to: line.to, insert: indent + body};
                anchor = line.from + indent.length + body.length;
            } else {
                changes = {from: line.to, insert: `\n${indent}${body}`};
                anchor = line.to + 1 + indent.length + body.length;
            }
        }
        this.view.dispatch({changes, selection: {anchor}, scrollIntoView: true});
        this.view.focus();
    }

    // Autocomplete: members after `self.`, `world.` or an extension name, then
    // everything else by name.
    completions (context) {
        const entries = paletteEntries();
        const member = context.matchBefore(/\b[A-Za-z_]\w*\.\w*/);
        if (member) {
            const prefix = member.text.slice(0, member.text.indexOf('.') + 1);
            const seen = new Set();
            const options = entries
                .filter(entry => entry.snippet.startsWith(prefix))
                .map(entry => {
                    const text = entry.snippet.slice(prefix.length);
                    return {
                        label: text,
                        info: entry.help,
                        type: isExpression(entry) ? 'property' : 'method',
                        apply: text
                    };
                })
                .filter(option => !seen.has(option.label) && seen.add(option.label));
            if (options.length) return {from: member.from + prefix.length, options, validFor: /^\w*$/};
        }
        const word = context.matchBefore(/@?\w+/);
        if (!word || (word.from === word.to && !context.explicit)) return null;
        const options = entries
            .filter(entry => !/^@?[A-Za-z_]\w*\./.test(entry.snippet))
            .map(entry => ({
                label: chipText(entry),
                info: entry.help,
                type: entry.shape === 'hat' ? 'function' : 'keyword',
                apply: (view, completion, from, to) => {
                    const line = view.state.doc.lineAt(from);
                    const indent = /^\s*/.exec(line.text)[0];
                    const insert = entry.snippet.split('\n').join(`\n${indent}`);
                    view.dispatch({
                        changes: {from, to, insert},
                        selection: {anchor: from + insert.length}
                    });
                }
            }));
        return {from: word.from, options};
    }

    render () {
        return null;
    }
}

PythonPanel.propTypes = {
    isVisible: PropTypes.bool,
    theme: PropTypes.shape({
        getBlockColors: PropTypes.func,
        isDark: PropTypes.func
    }).isRequired,
    vm: PropTypes.shape({
        editingTarget: PropTypes.object,
        runtime: PropTypes.object,
        on: PropTypes.func,
        off: PropTypes.func,
        emitWorkspaceUpdate: PropTypes.func,
        emitTargetsUpdate: PropTypes.func
    }).isRequired
};

export default connect(
    state => ({theme: state.scratchGui.theme.theme})
)(PythonPanel);
