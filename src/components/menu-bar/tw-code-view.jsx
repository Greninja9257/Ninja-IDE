import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import check from './check.svg';
import dropdownCaret from './dropdown-caret.svg';
import blocksIcon from './ninja-view-blocks.svg';
import pythonIcon from './ninja-view-python.svg';
import {MenuItem, Submenu} from '../menu/menu.jsx';
import {
    closeSettingsMenu,
    codeViewMenuOpen,
    openCodeViewMenu
} from '../../reducers/menus.js';
import {
    CODE_VIEW_BLOCKS,
    CODE_VIEW_PYTHON,
    setCodeView
} from '../../reducers/ninja-code-view.js';
import styles from './settings-menu.css';

const options = [
    {id: CODE_VIEW_BLOCKS, label: 'Blocks', icon: blocksIcon},
    {id: CODE_VIEW_PYTHON, label: 'Python', icon: pythonIcon}
];

const CodeViewMenu = ({isOpen, isRtl, onChangeView, onOpen, view}) => (
    <MenuItem expanded={isOpen}>
        <div
            className={styles.option}
            onClick={onOpen}
        >
            <img
                className={styles.codeViewIcon}
                src={view === CODE_VIEW_PYTHON ? pythonIcon : blocksIcon}
                draggable={false}
                width={20}
                height={20}
            />
            <span className={styles.submenuLabel}>{'Code'}</span>
            <img
                className={styles.expandCaret}
                src={dropdownCaret}
                draggable={false}
            />
        </div>
        <Submenu place={isRtl ? 'left' : 'right'}>
            {options.map(option => (
                <MenuItem
                    key={option.id}
                    // eslint-disable-next-line react/jsx-no-bind
                    onClick={() => onChangeView(option.id)}
                >
                    <div className={styles.option}>
                        <img
                            width={15}
                            height={12}
                            className={classNames(styles.check, {
                                [styles.selected]: view === option.id
                            })}
                            src={check}
                            draggable={false}
                        />
                        <img
                            className={styles.codeViewIcon}
                            src={option.icon}
                            draggable={false}
                            width={20}
                            height={20}
                        />
                        <span>{option.label}</span>
                    </div>
                </MenuItem>
            ))}
        </Submenu>
    </MenuItem>
);

CodeViewMenu.propTypes = {
    isOpen: PropTypes.bool,
    isRtl: PropTypes.bool,
    onChangeView: PropTypes.func.isRequired,
    onOpen: PropTypes.func.isRequired,
    view: PropTypes.string
};

export default connect(
    state => ({
        isOpen: codeViewMenuOpen(state),
        isRtl: state.locales.isRtl,
        view: state.scratchGui.ninjaCodeView.view
    }),
    dispatch => ({
        onChangeView: view => {
            dispatch(setCodeView(view));
            dispatch(closeSettingsMenu());
        },
        onOpen: () => dispatch(openCodeViewMenu())
    })
)(CodeViewMenu);
