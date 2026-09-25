import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import VM from 'scratch-vm';

import Button from '../button/button.jsx';
import {showAlertWithTimeout} from '../../reducers/alerts';
import thumbnailIcon from './icon--thumbnail.svg';
import styles from './stage-header.css';

// Draws an image into the stage's 480x360 shape and encodes it small enough
// for the server (snapshots on high-DPI screens are twice that size).
const toThumbnail = image => {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 360;
    const scale = Math.max(480 / image.width, 360 / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    canvas.getContext('2d').drawImage(image, (480 - w) / 2, (360 - h) / 2, w, h);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
        .then(blob => (blob.size > 500 * 1024 ?
            new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9)) :
            blob));
};

// Sets the project's thumbnail on the Ninja server, from the stage as it
// looks right now or from an image file. Only the project's owner sees it.
class ThumbnailButton extends React.Component {
    constructor (props) {
        super(props);
        this.state = {open: false};
        this.handleToggle = this.handleToggle.bind(this);
        this.handleDocumentClick = this.handleDocumentClick.bind(this);
        this.handleUseStage = this.handleUseStage.bind(this);
        this.handleUpload = this.handleUpload.bind(this);
        this.setRef = this.setRef.bind(this);
    }
    componentWillUnmount () {
        document.removeEventListener('mousedown', this.handleDocumentClick);
    }
    setRef (ref) {
        this.ref = ref;
    }
    setOpen (open) {
        this.setState({open});
        if (open) document.addEventListener('mousedown', this.handleDocumentClick);
        else document.removeEventListener('mousedown', this.handleDocumentClick);
    }
    handleToggle () {
        this.setOpen(!this.state.open);
    }
    handleDocumentClick (e) {
        if (this.ref && !this.ref.contains(e.target)) this.setOpen(false);
    }
    save (blob) {
        return fetch(`/api/projects/${this.props.projectId}/thumbnail?set=1`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {'Content-Type': blob.type},
            body: blob
        })
            .then(res => {
                if (!res.ok) throw new Error(res.status);
                this.props.onShowAlert('thumbnailSaved');
            })
            .catch(() => this.props.onShowAlert('thumbnailError'));
    }
    handleUseStage () {
        this.setOpen(false);
        const vm = this.props.vm;
        vm.postIOData('video', {forceTransparentPreview: true});
        vm.renderer.requestSnapshot(dataURI => {
            vm.postIOData('video', {forceTransparentPreview: false});
            fetch(dataURI)
                .then(res => res.blob())
                .then(blob => createImageBitmap(blob))
                .then(toThumbnail)
                .then(blob => this.save(blob))
                .catch(() => this.props.onShowAlert('thumbnailError'));
        });
        vm.renderer.draw();
    }
    handleUpload () {
        this.setOpen(false);
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.addEventListener('change', () => {
            const file = input.files[0];
            if (!file) return;
            createImageBitmap(file)
                .then(toThumbnail)
                .then(blob => this.save(blob))
                .catch(() => this.props.onShowAlert('thumbnailError'));
        });
        input.click();
    }
    render () {
        if (!this.props.canSetThumbnail) return null;
        return (
            <div
                className={styles.thumbnailButton}
                ref={this.setRef}
            >
                <Button
                    className={styles.stageButton}
                    onClick={this.handleToggle}
                >
                    <img
                        alt="Set thumbnail"
                        className={styles.stageButtonIcon}
                        draggable={false}
                        src={thumbnailIcon}
                        title="Set thumbnail"
                    />
                </Button>
                {this.state.open && (
                    <div className={styles.thumbnailMenu}>
                        <button
                            className={styles.thumbnailMenuItem}
                            onClick={this.handleUseStage}
                        >
                            {'Use current stage'}
                        </button>
                        <button
                            className={styles.thumbnailMenuItem}
                            onClick={this.handleUpload}
                        >
                            {'Upload image'}
                        </button>
                    </div>
                )}
            </div>
        );
    }
}

ThumbnailButton.propTypes = {
    canSetThumbnail: PropTypes.bool,
    onShowAlert: PropTypes.func,
    projectId: PropTypes.string,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => {
    const session = state.session && state.session.session;
    const user = session && session.user;
    const projectId = state.scratchGui.projectState.projectId;
    const author = state.scratchGui.tw.author.username;
    return {
        projectId,
        // A project this account just created has no author loaded yet.
        canSetThumbnail: Boolean(user && projectId && projectId !== '0' && (!author || author === user.username))
    };
};

const mapDispatchToProps = dispatch => ({
    onShowAlert: alertId => showAlertWithTimeout(dispatch, alertId)
});

export default connect(mapStateToProps, mapDispatchToProps)(ThumbnailButton);
