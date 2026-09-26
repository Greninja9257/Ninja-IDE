import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import Modal from '../../containers/modal.jsx';
import Box from '../box/box.jsx';
import {setProjectTeam} from '../../reducers/ninja-session';

import promptStyles from '../prompt/prompt.css';
import styles from './collab-modal.css';

const request = (method, path, body) => fetch(`/api/projects/${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? {'Content-Type': 'application/json'} : {},
    body: body ? JSON.stringify(body) : null
}).then(res => res.json().catch(() => ({})).then(data => {
    if (!res.ok) throw new Error(data.error || 'error');
    return data;
}));

const ERRORS = {
    user_not_found: 'Couldn’t find that user.',
    already_owner: 'That’s you.',
    too_many_collaborators: 'A project can have up to 10 collaborators.',
    rate_limited: 'Slow down a little.',
    muted: 'You can’t invite people while muted.'
};

/**
 * The owner's list of collaborators: invite by username, remove anyone.
 * Invited people accept from their messages.
 */
class CollabModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {members: [], username: '', error: null, busy: false};
        this.handleChange = this.handleChange.bind(this);
        this.handleKeyPress = this.handleKeyPress.bind(this);
        this.handleInvite = this.handleInvite.bind(this);
    }

    componentDidMount () {
        this.load();
    }

    load () {
        return request('GET', `${this.props.projectId}/collaborators`)
            .then(members => {
                this.setState({members});
                this.props.onSetTeam(members);
            })
            .catch(() => {});
    }

    handleChange (e) {
        this.setState({username: e.target.value, error: null});
    }

    handleKeyPress (e) {
        if (e.key === 'Enter') this.handleInvite();
    }

    handleInvite () {
        const username = this.state.username.trim();
        if (!username || this.state.busy) return;
        this.setState({busy: true});
        request('POST', `${this.props.projectId}/collaborators`, {username})
            .then(() => {
                this.setState({username: ''});
                return this.load();
            })
            .catch(err => this.setState({error: ERRORS[err.message] || 'Something went wrong.'}))
            .then(() => this.setState({busy: false}));
    }

    remove (member) {
        request('DELETE', `${this.props.projectId}/collaborators/${encodeURIComponent(member.username)}`)
            .then(() => this.load())
            .catch(() => {});
    }

    render () {
        const {members, username, error, busy} = this.state;
        return (
            <Modal
                className={promptStyles.modalContent}
                contentLabel="Collaborators"
                id="ninjaCollabModal"
                onRequestClose={this.props.onClose}
            >
                <Box className={promptStyles.body}>
                    <Box className={promptStyles.label}>{'Invite by username:'}</Box>
                    <Box className={styles.inviteRow}>
                        <input
                            autoFocus
                            className={promptStyles.variableNameTextInput}
                            disabled={busy}
                            maxLength={40}
                            value={username}
                            onChange={this.handleChange}
                            onKeyPress={this.handleKeyPress}
                        />
                    </Box>
                    {error ? <div className={styles.error}>{error}</div> : null}
                    {members.length ? (
                        <ul className={styles.list}>
                            {members.map(member => (
                                <li
                                    className={styles.row}
                                    key={member.username}
                                >
                                    <img
                                        className={styles.avatar}
                                        src={member.avatar}
                                    />
                                    <a
                                        className={styles.name}
                                        href={`/users/${member.username}`}
                                        rel="noopener noreferrer"
                                        target="_blank"
                                    >{member.username}</a>
                                    {member.accepted ? null : <span className={styles.pending}>{'Invited'}</span>}
                                    <button
                                        className={styles.remove}
                                        onClick={() => this.remove(member)} // eslint-disable-line react/jsx-no-bind
                                    >{'Remove'}</button>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    <Box className={promptStyles.buttonRow}>
                        <button
                            className={promptStyles.cancelButton}
                            onClick={this.props.onClose}
                        >{'Close'}</button>
                        <button
                            className={promptStyles.okButton}
                            disabled={busy || !username.trim()}
                            onClick={this.handleInvite}
                        >{'Invite'}</button>
                    </Box>
                </Box>
            </Modal>
        );
    }
}

CollabModal.propTypes = {
    onClose: PropTypes.func.isRequired,
    onSetTeam: PropTypes.func,
    projectId: PropTypes.string
};

const mapStateToProps = state => ({
    projectId: state.scratchGui.projectState.projectId
});

const mapDispatchToProps = dispatch => ({
    onSetTeam: members => dispatch(setProjectTeam(members, false, false))
});

export default connect(mapStateToProps, mapDispatchToProps)(CollabModal);
