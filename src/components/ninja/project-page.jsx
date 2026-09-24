import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import reactStringReplace from 'react-string-replace';

import classNames from 'classnames';

import loveIcon from './icons/love.svg';
import favouriteIcon from './icons/favourite.svg';
import remixIcon from './icons/remix.svg';
import viewsIcon from './icons/views.svg';
import seeInsideButtonIcon from '../menu-bar/icon--see-community.svg';
import {setPlayer} from '../../reducers/mode';

import styles from './project-page.css';

/**
 * What sits around the stage when a project is being viewed rather than edited.
 *
 * Arranged the way Scratch arranges a project page — title above the stage,
 * author and counts below it, then the description blocks — without depending
 * on Scratch for any of it.
 *
 * Every section is always rendered. An empty project shows the same page with
 * nothing written in it, rather than a stage floating on its own, so the shape
 * of the page does not change as a project gains a description.
 */

/** Link bare URLs. Nothing here points anywhere in particular. */
const decorate = text => {
    if (!text) return null;
    const linkRegex = /(https?:\/\/[\w\d_\-.]{1,256}(?:\/(?:\S*[\w:/#[\]@$&'()*+=])?)?(?![^?!,:;\w\s]\S))/g;
    return reactStringReplace(text, linkRegex, (match, i) => (
        <a
            href={match}
            target="_blank"
            rel="noreferrer"
            key={`l${match}${i}`}
        >{match}</a>
    ));
};

const Block = ({heading, body, placeholder}) => (
    <div className={styles.block}>
        <div className={styles.textlabel}>{heading}</div>
        <div className={styles.description}>
            {body && body.trim() ? decorate(body) : <span className={styles.placeholder}>{placeholder}</span>}
        </div>
    </div>
);

Block.propTypes = {
    body: PropTypes.string,
    heading: PropTypes.string.isRequired,
    placeholder: PropTypes.string.isRequired
};

const Stat = ({actionable, icon, iconClassName, label, value}) => (
    <span
        className={classNames(styles.stat, {[styles.actionable]: actionable})}
        title={label}
    >
        <img
            className={classNames(styles.statIcon, iconClassName)}
            src={icon}
            alt={label}
            draggable={false}
        />
        {(value || 0).toLocaleString()}
    </span>
);

Stat.propTypes = {
    actionable: PropTypes.bool,
    icon: PropTypes.string.isRequired,
    iconClassName: PropTypes.string,
    label: PropTypes.string.isRequired,
    value: PropTypes.number
};

/**
 * `part` places each piece around the stage:
 *
 *   heading  the title, above everything
 *   notes    the description column, to the right of the stage
 *   credit   the author and counts, below both
 */
const ProjectPage = ({author, description, onSeeInside, part, stats, title}) => {
    if (part === 'heading') {
        return (
            <div className={styles.headRow}>
                <div className={styles.titleGroup}>
                    <div className={styles.avatar}>
                        {author.thumbnail ? (
                            <img
                                src={author.thumbnail}
                                alt=""
                                draggable={false}
                            />
                        ) : null}
                    </div>
                    <h1 className={styles.title}>{title}</h1>
                </div>
                <div className={styles.buttons}>
                    <button className={classNames(styles.button, styles.remix)}>
                        <img
                            className={classNames(styles.buttonIcon, styles.remixButtonIcon)}
                            src={remixIcon}
                            alt=""
                            draggable={false}
                        />
                        {'Remix'}
                    </button>
                    <button
                        className={styles.button}
                        onClick={onSeeInside}
                    >
                        <img
                            className={classNames(styles.buttonIcon, styles.seeInsideButtonIcon)}
                            src={seeInsideButtonIcon}
                            alt=""
                            draggable={false}
                        />
                        {'See inside'}
                    </button>
                </div>
            </div>
        );
    }

    if (part === 'notes') {
        return (
            <div className={styles.notes}>
                <Block
                    heading="Instructions"
                    body={description.instructions}
                    placeholder="Tell people how to use your project (such as which keys to press)."
                />
                <Block
                    heading="Notes and Credits"
                    body={description.credits}
                    // Matches the wording used by Scratch's project page.
                    placeholder="How did you make this project? Did you use ideas, scripts or artwork from other people? Thank them here."
                />
            </div>
        );
    }

    return (
        <React.Fragment>
            <div className={styles.creditRow}>
                <div className={styles.stats}>
                    <Stat
                        actionable
                        icon={loveIcon}
                        label="loves"
                        value={stats && stats.loves}
                    />
                    <Stat
                        actionable
                        icon={favouriteIcon}
                        label="favourites"
                        value={stats && stats.favorites}
                    />
                    <Stat
                        icon={remixIcon}
                        iconClassName={styles.remixStatIcon}
                        label="remixes"
                        value={stats && stats.remixes}
                    />
                    <Stat
                        icon={viewsIcon}
                        label="views"
                        value={stats && stats.views}
                    />
                </div>
                <span className={styles.username}>{author.username}</span>
                <span className={styles.spacer} />
            </div>

            <div className={styles.commentsHeading}>{'Comments'}</div>
            <div className={styles.commentsEmpty} />
        </React.Fragment>
    );
};

ProjectPage.propTypes = {
    part: PropTypes.oneOf(['heading', 'notes', 'credit']),
    author: PropTypes.shape({
        username: PropTypes.string,
        thumbnail: PropTypes.string
    }).isRequired,
    description: PropTypes.shape({
        instructions: PropTypes.string,
        credits: PropTypes.string
    }).isRequired,
    onSeeInside: PropTypes.func.isRequired,
    stats: PropTypes.shape({
        views: PropTypes.number,
        loves: PropTypes.number,
        favorites: PropTypes.number,
        remixes: PropTypes.number
    }),
    title: PropTypes.string
};

export default connect(
    state => ({
        author: state.scratchGui.tw.author,
        description: state.scratchGui.tw.description,
        stats: state.scratchGui.tw.stats,
        title: state.scratchGui.projectTitle
    }),
    dispatch => ({
        onSeeInside: () => dispatch(setPlayer(false))
    })
)(ProjectPage);
