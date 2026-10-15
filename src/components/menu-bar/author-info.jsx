import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import {FormattedMessage} from 'react-intl';
import UserAvatar from './user-avatar.jsx';

import styles from './author-info.css';

const ActualAuthorInfo = ({
    className,
    imageUrl,
    projectTitle,
    userId, // eslint-disable-line no-unused-vars
    username
}) => (
    <div
        className={classNames(
            className,
            styles.authorInfo
        )}
    >
        <UserAvatar
            className={styles.avatar}
            imageUrl={imageUrl}
        />
        <div className={styles.titleAuthor}>
            <h1 className={styles.projectTitle}>
                {projectTitle}
            </h1>
            <div>
                <span className={styles.usernameLine}>
                    <FormattedMessage
                        defaultMessage="by {username}"
                        description="Shows that a project was created by this user"
                        id="gui.authorInfo.byUser"
                        values={{
                            username: <span className={styles.username}>{username}</span>
                        }}
                    />
                </span>
            </div>
        </div>
    </div>
);

ActualAuthorInfo.propTypes = {
    className: PropTypes.string,
    imageUrl: PropTypes.string,
    projectTitle: PropTypes.string,
    userId: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
    username: PropTypes.oneOfType([PropTypes.string, PropTypes.bool])
};

// Opens the author's Ninja profile.
const AuthorInfo = props => (
    props.username ? (
        <a
            className={styles.link}
            href={`/users/${props.username}`}
            target="_blank"
            rel="noopener noreferrer"
        >
            <ActualAuthorInfo {...props} />
        </a>
    ) : <ActualAuthorInfo {...props} />
);
AuthorInfo.propTypes = {
    username: PropTypes.oneOfType([PropTypes.string, PropTypes.bool])
};

export default AuthorInfo;
