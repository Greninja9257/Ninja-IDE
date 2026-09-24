import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import {setCodeView, CODE_VIEW_BLOCKS, CODE_VIEW_PYTHON} from '../../reducers/ninja-code-view.js';

import blocksIcon from '../menu-bar/ninja-view-blocks.svg';
import pythonIcon from '../menu-bar/ninja-view-python.svg';
import styles from './code-view-toggle.css';

/**
 * Switches the Code tab between blocks and Python.
 *
 * With only two views a menu would be a list of one alternative, so this is a
 * single button. It shows the view it will switch to, which is what makes the
 * click predictable without a label.
 */
const CodeViewToggle = ({view, onToggle}) => {
    const next = view === CODE_VIEW_PYTHON ? CODE_VIEW_BLOCKS : CODE_VIEW_PYTHON;
    const label = next === CODE_VIEW_PYTHON ? 'Switch to Python' : 'Switch to blocks';

    return (
        <button
            className={styles.toggle}
            title={label}
            aria-label={label}
            // eslint-disable-next-line react/jsx-no-bind
            onClick={() => onToggle(next)}
        >
            <img
                className={styles.icon}
                src={next === CODE_VIEW_PYTHON ? pythonIcon : blocksIcon}
                draggable={false}
            />
        </button>
    );
};

CodeViewToggle.propTypes = {
    onToggle: PropTypes.func.isRequired,
    view: PropTypes.string
};

export default connect(
    state => ({view: state.scratchGui.ninjaCodeView.view}),
    dispatch => ({onToggle: view => dispatch(setCodeView(view))})
)(CodeViewToggle);
