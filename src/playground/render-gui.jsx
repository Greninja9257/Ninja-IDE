import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import GUI from '../containers/gui.jsx';
import {loadSession, setProjectShared} from '../reducers/ninja-session';

// The IDE is served by the Ninja server, which stores projects and assets and
// runs cloud variables on the same origin.
const searchParams = new URLSearchParams(location.search);
const isMultiplayerClient = searchParams.has('multiplayer');
const cloudHost = searchParams.get('cloud_host') ||
    `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/cloud`;

const postBlob = (url, blob) => fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {'Content-Type': blob.type || 'application/octet-stream'},
    body: blob
});

class RenderGUI extends React.Component {
    constructor (props) {
        super(props);
        this.handleShare = this.handleShare.bind(this);
        this.handleSeeCommunity = this.handleSeeCommunity.bind(this);
        this.handleUpdateProjectThumbnail = this.handleUpdateProjectThumbnail.bind(this);
        this.handleUpdateProjectTitle = this.handleUpdateProjectTitle.bind(this);
        this.handleLogOut = this.handleLogOut.bind(this);
        this.handleOpenRegistration = this.handleOpenRegistration.bind(this);
        this.handleClickLogin = this.handleClickLogin.bind(this);
        this.handleClickLogo = this.handleClickLogo.bind(this);
    }
    componentDidMount () {
        this.props.onLoadSession();
    }
    handleShare () {
        const id = this.props.reduxProjectId;
        return fetch(`/api/projects/${id}/share`, {method: 'POST', credentials: 'same-origin'})
            .then(res => {
                if (res.ok) this.props.onSetShared(true);
            });
    }
    handleSeeCommunity () {
        location.href = `/projects/${this.props.reduxProjectId}`;
    }
    // Renaming in the editor saves the title right away, as scratch-www does,
    // so it sticks even when nothing else in the project changed.
    handleUpdateProjectTitle (title, isDefault) {
        const {authorUsername, reduxProjectId, username} = this.props;
        const saved = Boolean(reduxProjectId) && reduxProjectId !== '0';
        if (isDefault || !saved || !username || username !== authorUsername) return;
        fetch(`/api/projects/${reduxProjectId}`, {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({title})
        }).catch(() => {});
    }
    handleUpdateProjectThumbnail (projectId, blob) {
        postBlob(`/api/projects/${projectId}/thumbnail`, blob).catch(() => {});
    }
    handleLogOut () {
        fetch('/api/auth/logout', {method: 'POST', credentials: 'same-origin'})
            .then(() => location.reload());
    }
    handleOpenRegistration () {
        location.href = `/join?next=${encodeURIComponent(`/editor${location.hash}`)}`;
    }
    handleClickLogin () {
        location.href = `/login?next=${encodeURIComponent(`/editor${location.hash}`)}`;
    }
    handleClickLogo () {
        location.href = '/';
    }
    render () {
        const {
            authorUsername,
            isShared,
            reduxProjectId,
            username,
            onLoadSession, // eslint-disable-line no-unused-vars
            onSetShared, // eslint-disable-line no-unused-vars
            ...props
        } = this.props;
        const hasId = Boolean(reduxProjectId) && reduxProjectId !== '0';
        const owns = Boolean(username && authorUsername && username === authorUsername);
        return (
            <GUI
                projectHost="/api/projects"
                assetHost="/api/assets"
                cloudHost={cloudHost}
                canUseCloud
                hasCloudPermission
                canCreateNew={!isMultiplayerClient && Boolean(username)}
                canSave={owns}
                canCreateCopy={owns && hasId}
                canRemix={Boolean(username) && !owns && hasId && Boolean(authorUsername)}
                canShare={owns && hasId}
                isShared={isShared}
                basePath={process.env.ROOT}
                canEditTitle
                enableCommunity
                onShare={this.handleShare}
                onSeeCommunity={hasId ? this.handleSeeCommunity : null}
                onUpdateProjectThumbnail={this.handleUpdateProjectThumbnail}
                onUpdateProjectTitle={this.handleUpdateProjectTitle}
                onLogOut={this.handleLogOut}
                onOpenRegistration={this.handleOpenRegistration}
                onClickLogin={this.handleClickLogin}
                onClickLogo={this.handleClickLogo}
                {...props}
            />
        );
    }
}

RenderGUI.propTypes = {
    authorUsername: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
    isShared: PropTypes.bool,
    reduxProjectId: PropTypes.string,
    username: PropTypes.string,
    onLoadSession: PropTypes.func,
    onSetShared: PropTypes.func
};

const mapStateToProps = state => {
    const session = state.session && state.session.session;
    return {
        authorUsername: state.scratchGui.tw.author.username,
        isShared: Boolean(state.session && state.session.isShared),
        reduxProjectId: state.scratchGui.projectState.projectId,
        username: session && session.user ? session.user.username : null
    };
};

const mapDispatchToProps = dispatch => ({
    onLoadSession: () => loadSession(dispatch),
    onSetShared: isShared => dispatch(setProjectShared(isShared))
});

export default connect(mapStateToProps, mapDispatchToProps)(RenderGUI);
