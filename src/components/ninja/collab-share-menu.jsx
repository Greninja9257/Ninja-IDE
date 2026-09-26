import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import Button from '../button/button.jsx';
import {openNinjaCollabModal} from '../../reducers/modals';
import {setProjectTeam} from '../../reducers/ninja-session';

import shareStyles from '../menu-bar/share-button.css';
import styles from './collab-share-menu.css';

/**
 * Wraps the owner's Share button: hovering it pops a "Collab" button out
 * underneath that opens the collaborators window. Also loads who's
 * invited, so the owner joins the live room as soon as anyone has been.
 */
class CollabShareMenu extends React.Component {
    constructor (props) {
        super(props);
        this.state = {open: false};
        this.handleEnter = this.handleEnter.bind(this);
        this.handleLeave = this.handleLeave.bind(this);
        this.handleCollab = this.handleCollab.bind(this);
    }

    componentDidMount () {
        this.load();
    }

    componentDidUpdate (prevProps) {
        if (prevProps.projectId !== this.props.projectId) this.load();
    }

    load () {
        const {projectId, onSetTeam} = this.props;
        fetch(`/api/projects/${projectId}/collaborators`, {credentials: 'same-origin'})
            .then(res => (res.ok ? res.json() : null))
            .then(members => {
                if (members && projectId === this.props.projectId) onSetTeam(members);
            })
            .catch(() => {});
    }

    handleEnter () {
        this.setState({open: true});
    }

    handleLeave () {
        this.setState({open: false});
    }

    handleCollab () {
        this.setState({open: false});
        this.props.onOpenCollab();
    }

    render () {
        return (
            <div
                className={classNames(this.props.className, styles.wrapper)}
                onMouseEnter={this.handleEnter}
                onMouseLeave={this.handleLeave}
            >
                {this.props.children}
                {this.state.open ? (
                    <div className={styles.popout}>
                        <Button
                            className={classNames(this.props.buttonClassName, shareStyles.shareButton, styles.collabButton)}
                            onClick={this.handleCollab}
                        >{'Collab'}</Button>
                    </div>
                ) : null}
            </div>
        );
    }
}

CollabShareMenu.propTypes = {
    buttonClassName: PropTypes.string,
    children: PropTypes.node,
    className: PropTypes.string,
    onOpenCollab: PropTypes.func,
    onSetTeam: PropTypes.func,
    projectId: PropTypes.string
};

const mapStateToProps = state => ({
    projectId: state.scratchGui.projectState.projectId
});

const mapDispatchToProps = dispatch => ({
    onOpenCollab: () => dispatch(openNinjaCollabModal()),
    onSetTeam: members => dispatch(setProjectTeam(members, false, false))
});

export default connect(mapStateToProps, mapDispatchToProps)(CollabShareMenu);
