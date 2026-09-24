import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import Blocks from '../../containers/blocks.jsx';
import PythonPanel from './python-panel.jsx';

import {CODE_VIEW_PYTHON} from '../../reducers/ninja-code-view.js';

import styles from './code-panel.css';

/**
 * The Code tab.
 *
 * Blocks and Python are the same scripts shown two ways, so they are a toggle
 * inside one tab rather than two tabs. Scratch's own tab row — Code, Costumes,
 * Sounds — is left as it is.
 */
class CodePanel extends React.Component {
    render () {
        const {basePath, blocksId, canUseCloud, stageSize, theme, vm,
            view, onOpenCustomExtensionModal} = this.props;


        return (
            <div className={styles.panel}>
                <div className={styles.content}>
                    {/* Python view is a layer the Python panel places inside the
                        block editor, beside its palette. */}
                    <PythonPanel
                        isVisible={view === CODE_VIEW_PYTHON}
                        vm={vm}
                    />
                    <div className={styles.slot}>
                        <Blocks
                            key={`${blocksId}/${theme.id}`}
                            canUseCloud={canUseCloud}
                            grow={1}
                            isVisible
                            options={{media: `${basePath}static/${theme.getBlocksMediaFolder()}/`}}
                            stageSize={stageSize}
                            theme={theme}
                            vm={vm}
                            onOpenCustomExtensionModal={onOpenCustomExtensionModal}
                        />
                    </div>
                </div>
            </div>
        );
    }
}

CodePanel.propTypes = {
    basePath: PropTypes.string,
    blocksId: PropTypes.string,
    canUseCloud: PropTypes.bool,
    onOpenCustomExtensionModal: PropTypes.func,
    stageSize: PropTypes.string,
    theme: PropTypes.object,
    view: PropTypes.string,
    vm: PropTypes.object.isRequired
};

export default connect(
    state => ({view: state.scratchGui.ninjaCodeView.view})
)(CodePanel);
