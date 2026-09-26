import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import {activateTab, BLOCKS_TAB_INDEX} from '../../reducers/editor-tab';
import styles from './collab-presence.css';

const nameToTarget = (vm, name) => (name === '__stage__' ?
    vm.runtime.getTargetForStage() :
    vm.runtime.targets.find(t => t.isOriginal && !t.isStage && t.sprite.name === name));

/**
 * Who's in the project right now, in the menu bar, as account pictures. Click someone to jump to
 * the sprite, tab and part of the code they're looking at.
 */
const CollabOnline = ({peers, vm, onActivateTab}) => {
    if (!peers.length) return null;
    const follow = peer => {
        const session = vm.ninjaCollab;
        const view = session && session.cursors.get(peer.id);
        if (!view) return;
        const target = nameToTarget(vm, view.target);
        if (target && vm.editingTarget !== target) vm.setEditingTarget(target.id);
        if (typeof view.tab === 'number') onActivateTab(view.tab);
        if (view.tab !== BLOCKS_TAB_INDEX || typeof view.scale !== 'number') return;
        // The code area reloads after the sprite changes; scroll once it has.
        setTimeout(() => {
            const B = window.ScratchBlocks || window.Blockly;
            const ws = B && B.getMainWorkspace && B.getMainWorkspace();
            if (!ws) return;
            ws.setScale(view.scale);
            ws.scroll(view.scrollX, view.scrollY);
        }, 50);
    };
    return (
        <div className={styles.panel}>
            {peers.map(peer => (
                <img
                    className={styles.user}
                    key={peer.id}
                    src={peer.avatar}
                    style={{borderColor: peer.color}}
                    title={peer.self ? peer.username : `${peer.username}: click to go to them`}
                    onClick={() => follow(peer)} // eslint-disable-line react/jsx-no-bind
                />
            ))}
        </div>
    );
};

CollabOnline.propTypes = {
    onActivateTab: PropTypes.func,
    peers: PropTypes.arrayOf(PropTypes.object),
    vm: PropTypes.object // eslint-disable-line react/forbid-prop-types
};

/**
 * Pictures of the other people on a sprite, in the corner of its tile.
 */
const CollabBadges = ({peers, target}) => {
    const here = peers.filter(p => p.target === target && !p.self);
    if (!here.length) return null;
    return (
        <div className={styles.badges}>
            {here.map(peer => (
                <div
                    className={styles.badge}
                    key={peer.id}
                    style={{backgroundImage: `url(${peer.avatar})`, borderColor: peer.color}}
                    title={peer.username}
                />
            ))}
        </div>
    );
};

CollabBadges.propTypes = {
    peers: PropTypes.arrayOf(PropTypes.object),
    target: PropTypes.string
};

const mapStateToProps = state => ({
    peers: (state.session && state.session.collabPeers) || [],
    vm: state.scratchGui.vm
});

const ConnectedCollabOnline = connect(mapStateToProps, dispatch => ({
    onActivateTab: tab => dispatch(activateTab(tab))
}))(CollabOnline);

const ConnectedCollabBadges = connect(mapStateToProps, () => ({}))(CollabBadges);

export {
    ConnectedCollabOnline as CollabOnline,
    ConnectedCollabBadges as CollabBadges
};
