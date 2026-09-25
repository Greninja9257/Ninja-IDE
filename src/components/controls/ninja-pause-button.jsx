import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import VM from 'scratch-vm';

import {isPaused, setPaused, onPauseChanged, setup} from '../../addons/addons/debugger/module.js';
import pauseIcon from '../../addons/addons/pause/pause.svg';
import playIcon from '../../addons/addons/pause/play.svg';
import styles from './controls.css';

const messages = defineMessages({
    pause: {
        id: 'ninja.controls.pause',
        defaultMessage: 'Pause',
        description: 'Title of the button that pauses the project'
    },
    resume: {
        id: 'ninja.controls.resume',
        defaultMessage: 'Resume',
        description: 'Title of the button that resumes a paused project'
    }
});

// Pause, built into the game controls so it is there in the editor, the
// player and embeds alike. Uses the Pause button addon's pausing code.
class PauseButton extends React.Component {
    constructor (props) {
        super(props);
        this.state = {paused: false};
        this.handleClick = this.handleClick.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handlePauseChanged = this.handlePauseChanged.bind(this);
    }
    componentDidMount () {
        setup({tab: {traps: {vm: this.props.vm}}});
        onPauseChanged(this.handlePauseChanged);
        this.handlePauseChanged();
        document.addEventListener('keydown', this.handleKeyDown, {capture: true});
    }
    componentWillUnmount () {
        this.unmounted = true;
        document.removeEventListener('keydown', this.handleKeyDown, {capture: true});
    }
    handlePauseChanged () {
        if (!this.unmounted) this.setState({paused: isPaused()});
    }
    handleClick () {
        setPaused(!isPaused());
    }
    // Alt+X (Option+X on macOS), as in the addon. keyCode covers macOS,
    // where Option changes e.key.
    handleKeyDown (e) {
        if (e.altKey && (e.key.toLowerCase() === 'x' || e.keyCode === 88)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setPaused(!isPaused());
        }
    }
    render () {
        const title = this.props.intl.formatMessage(this.state.paused ? messages.resume : messages.pause);
        return (
            <img
                alt={title}
                className={styles.pauseButton}
                draggable={false}
                src={this.state.paused ? playIcon : pauseIcon}
                title={title}
                onClick={this.handleClick}
            />
        );
    }
}

PauseButton.propTypes = {
    intl: intlShape.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default injectIntl(PauseButton);
