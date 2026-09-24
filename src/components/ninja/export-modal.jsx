import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import {connect} from 'react-redux';

import Modal from '../../containers/modal.jsx';
import Box from '../box/box.jsx';
import {EXPORT_TARGETS, packageProject, downloadBlob} from '../../lib/ninja-export.js';

import promptStyles from '../prompt/prompt.css';
import styles from './export-modal.css';

const noop = () => {};

const messages = defineMessages({
    title: {
        defaultMessage: 'Export',
        description: 'Title of the export window',
        id: 'ninja.export.title'
    },
    label: {
        defaultMessage: 'Export as:',
        description: 'Label above the list of export formats',
        id: 'ninja.export.label'
    }
});

/**
 * Turns the project into something that runs without Ninja.
 *
 * Desktop targets bundle a browser runtime that is fetched on first use, so
 * the progress bar covers a download as well as the packaging itself.
 */
class ExportModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            selected: 'html',
            busy: false,
            progress: 0,
            error: null
        };
        this.handleExport = this.handleExport.bind(this);
        this.handleSelect = this.handleSelect.bind(this);
    }

    handleSelect (e) {
        this.setState({selected: e.target.value, error: null});
    }

    async handleExport () {
        const exportTarget = EXPORT_TARGETS.find(t => t.id === this.state.selected);
        if (!exportTarget) return;

        this.setState({busy: true, progress: 0, error: null});

        try {
            const projectData = await this.props.vm.saveProjectSb3();
            const {data, filename} = await packageProject({
                projectData,
                exportTarget,
                title: this.props.projectTitle,
                onProgress: (phase, progress) => {
                    this.setState({progress: Number.isFinite(progress) ? progress : 0});
                }
            });
            downloadBlob(data, filename);
            this.setState({busy: false, progress: 0});
            this.props.onClose();
        } catch (error) {
            this.setState({
                busy: false,
                error: String(error && error.message ? error.message : error)
            });
        }
    }

    render () {
        const {busy, selected, error} = this.state;

        return (
            <Modal
                className={promptStyles.modalContent}
                contentLabel={this.props.intl.formatMessage(messages.title)}
                id="ninjaExportModal"
                onRequestClose={busy ? noop : this.props.onClose}
            >
                <Box className={promptStyles.body}>
                    <Box className={promptStyles.label}>
                        {this.props.intl.formatMessage(messages.label)}
                    </Box>
                    <Box className={styles.targets}>
                        {EXPORT_TARGETS.map(target => (
                            <label
                                className={classNames({[promptStyles.disabledLabel]: busy})}
                                key={target.id}
                            >
                                <input
                                    checked={selected === target.id}
                                    disabled={busy}
                                    name="exportTarget"
                                    type="radio"
                                    value={target.id}
                                    onChange={this.handleSelect}
                                />
                                {target.name}
                            </label>
                        ))}
                    </Box>
                    {busy || error ? (
                        <Box className={styles.status}>
                            {busy ? (
                                <div className={styles.progress}>
                                    <div
                                        className={styles.progressBar}
                                        style={{width: `${Math.round(this.state.progress * 100)}%`}}
                                    />
                                </div>
                            ) : (
                                <span className={styles.error}>{error}</span>
                            )}
                        </Box>
                    ) : null}
                    <Box className={promptStyles.buttonRow}>
                        <button
                            className={promptStyles.cancelButton}
                            disabled={busy}
                            onClick={this.props.onClose}
                        >
                            <FormattedMessage
                                defaultMessage="Cancel"
                                description="Button in prompt for cancelling the dialog"
                                id="gui.prompt.cancel"
                            />
                        </button>
                        <button
                            className={promptStyles.okButton}
                            disabled={busy}
                            onClick={this.handleExport}
                        >
                            {this.props.intl.formatMessage(messages.title)}
                        </button>
                    </Box>
                </Box>
            </Modal>
        );
    }
}

ExportModal.propTypes = {
    intl: intlShape,
    onClose: PropTypes.func.isRequired,
    projectTitle: PropTypes.string,
    vm: PropTypes.shape({
        saveProjectSb3: PropTypes.func
    }).isRequired
};

const mapStateToProps = state => ({
    projectTitle: state.scratchGui.projectTitle,
    vm: state.scratchGui.vm
});

export default injectIntl(connect(mapStateToProps)(ExportModal));
