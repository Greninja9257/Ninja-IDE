import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import messagesIcon from './icon--messages.png';
import styles from './menu-bar.css';

// Messages, as in the website's navigation bar: the envelope, with the unread
// count kept live by the server's message stream.
class MessagesButton extends React.Component {
    constructor (props) {
        super(props);
        this.state = {unread: 0};
    }
    componentDidMount () {
        if (!window.EventSource) return;
        this.stream = new EventSource('/api/messages/stream');
        this.stream.addEventListener('message', e => {
            try {
                this.setState({unread: JSON.parse(e.data).unread});
            } catch (err) {
                // ignore
            }
        });
    }
    componentWillUnmount () {
        if (this.stream) this.stream.close();
    }
    render () {
        const {unread} = this.state;
        return (
            <a
                href="/messages/"
                title="Messages"
            >
                <div className={classNames(this.props.className, styles.navIconButton)}>
                    <img
                        className={styles.navIcon}
                        src={messagesIcon}
                        draggable={false}
                        alt="Messages"
                    />
                    {unread > 0 && <span className={styles.messageCount}>{unread}</span>}
                </div>
            </a>
        );
    }
}

MessagesButton.propTypes = {
    className: PropTypes.string
};

export default MessagesButton;
