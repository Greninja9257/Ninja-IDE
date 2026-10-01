import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import SettingsStore from '../../addons/settings-store-singleton';
import addonManifests from '../../addons/generated/addon-manifests.js';
import {BUILT_IN, CHANGED, CHOICES, isBuiltInOn, saveChoice} from '../../addons/ninja-addon-choices';
import check from './check.svg';
import dropdownCaret from './dropdown-caret.svg';
import addonsIcon from './addons.svg';
import {MenuItem, Submenu} from '../menu/menu.jsx';
import {addonsMenuOpen, openAddonsMenu} from '../../reducers/menus.js';
import styles from './settings-menu.css';

// Settings > Addons: the controls and displays people may switch on and off
// (every other addon is fixed). Each takes effect straight away.
const setEnabled = (addonId, enabled) => {
    if (BUILT_IN[addonId]) {
        saveChoice(addonId, enabled);
        return;
    }
    // setStore is what starts or stops an addon without a reload; it compares
    // stored values, so the current one is written down first.
    SettingsStore.getAddonStorage(addonId).enabled = SettingsStore.getAddonEnabled(addonId);
    const store = JSON.parse(JSON.stringify(SettingsStore.store));
    store[addonId].enabled = enabled;
    SettingsStore.setStore(store);
    saveChoice(addonId, enabled);
};

class AddonsMenu extends React.Component {
    constructor (props) {
        super(props);
        this.handleStoreChanged = this.handleStoreChanged.bind(this);
        this.state = {enabled: this.read()};
    }
    componentDidMount () {
        SettingsStore.addEventListener('addon-changed', this.handleStoreChanged);
        window.addEventListener(CHANGED, this.handleStoreChanged);
    }
    componentWillUnmount () {
        SettingsStore.removeEventListener('addon-changed', this.handleStoreChanged);
        window.removeEventListener(CHANGED, this.handleStoreChanged);
    }
    read () {
        return Object.fromEntries(CHOICES.map(id => [id, BUILT_IN[id] ? isBuiltInOn(id) : SettingsStore.getAddonEnabled(id)]));
    }
    handleStoreChanged () {
        this.setState({enabled: this.read()});
    }
    render () {
        const {isOpen, isRtl, onOpen} = this.props;
        return (
            <MenuItem expanded={isOpen}>
                <div
                    className={styles.option}
                    onClick={onOpen}
                >
                    <img
                        src={addonsIcon}
                        draggable={false}
                        width={20}
                        height={20}
                    />
                    <span className={styles.submenuLabel}>{'Addons'}</span>
                    <img
                        className={styles.expandCaret}
                        src={dropdownCaret}
                        draggable={false}
                    />
                </div>
                <Submenu place={isRtl ? 'left' : 'right'}>
                    {CHOICES.filter(id => BUILT_IN[id] || addonManifests[id]).map(id => (
                        <MenuItem
                            key={id}
                            // eslint-disable-next-line react/jsx-no-bind
                            onClick={() => setEnabled(id, !this.state.enabled[id])}
                        >
                            <div className={styles.option}>
                                <img
                                    width={15}
                                    height={12}
                                    className={classNames(styles.check, {
                                        [styles.selected]: this.state.enabled[id]
                                    })}
                                    src={check}
                                    draggable={false}
                                />
                                <span>{BUILT_IN[id] || addonManifests[id].name}</span>
                            </div>
                        </MenuItem>
                    ))}
                </Submenu>
            </MenuItem>
        );
    }
}

AddonsMenu.propTypes = {
    isOpen: PropTypes.bool,
    isRtl: PropTypes.bool,
    onOpen: PropTypes.func.isRequired
};

export default connect(
    state => ({
        isOpen: addonsMenuOpen(state),
        isRtl: state.locales.isRtl
    }),
    dispatch => ({
        onOpen: () => dispatch(openAddonsMenu())
    })
)(AddonsMenu);
