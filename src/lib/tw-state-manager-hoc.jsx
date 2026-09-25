import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import bindAll from 'lodash.bindall';
import VM from 'scratch-vm';
import log from './log';
import {defineMessages, intlShape, injectIntl} from 'react-intl';

import {
    setUsername
} from '../reducers/tw';
import {
    defaultProjectId,
    setProjectId
} from '../reducers/project-state';
import {
    setPlayer,
    setFullScreen
} from '../reducers/mode';
import {generateRandomUsername} from './tw-username';
import {setSearchParams} from './tw-navigation-utils';
import {defaultStageSize} from '../reducers/custom-stage-size';

/* eslint-disable no-alert */

const messages = defineMessages({
    invalidFPS: {
        defaultMessage: '"fps" URL parameter is invalid',
        description: 'Alert displayed when fps URL parameter is invalid',
        id: 'tw.invalidParameters.fps'
    }
});

const USERNAME_KEY = 'tw:username';

/**
 * The State Manager is responsible for managing persistent state and the URL.
 */

const setLocalStorage = (key, value) => {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        // ignore
    }
};

const getLocalStorage = key => {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        // ignore
    }
    return null;
};

const readHashProjectId = () => {
    const match = location.hash.match(/#(\d+)/);
    return match === null ? null : match[1];
};

class Router {
    constructor ({onSetProjectId, onSetIsPlayerOnly, onSetIsFullScreen}) {
        this.onSetProjectId = onSetProjectId;
        this.onSetIsPlayerOnly = onSetIsPlayerOnly;
        this.onSetIsFullScreen = onSetIsFullScreen;
    }

    onhashchange () {

    }

    onpathchange () {

    }

    generateURL () {
        return '';
    }
}

class HashRouter extends Router {
    onhashchange () {
        this.onSetProjectId(readHashProjectId() || defaultProjectId);
    }

    generateURL ({projectId}) {
        const hashQuery = location.hash.split('?')[1];
        return `${location.pathname}${location.search}#${projectId}${hashQuery ? `?${hashQuery}` : ''}`;
    }
}

class FileHashRouter extends HashRouter {
    constructor (callbacks) {
        super(callbacks);
        this.playerPath = location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1);
        this.editorPath = `${this.playerPath}editor.html`;
        this.fullscreenPath = `${this.playerPath}fullscreen.html`;
    }

    onpathchange () {
        const pathName = location.pathname;

        if (pathName === this.playerPath) {
            this.onSetIsPlayerOnly(true);
            this.onSetIsFullScreen(false);
        } else if (pathName === this.editorPath) {
            this.onSetIsPlayerOnly(false);
            this.onSetIsFullScreen(false);
        } else if (pathName === this.fullscreenPath) {
            this.onSetIsFullScreen(true);
        }
    }

    generateURL ({projectId, isPlayerOnly, isFullScreen}) {
        let newPathname = '';
        let newHash = '';

        if (projectId !== '0') {
            newHash = projectId;
        }
        const hashQuery = location.hash.split('?')[1];
        if (hashQuery) {
            newHash += `?${hashQuery}`;
        }

        if (isFullScreen) {
            newPathname = this.fullscreenPath;
        } else if (isPlayerOnly) {
            newPathname = this.playerPath;
        } else {
            newPathname = this.editorPath;
        }

        return `${newPathname}${location.search}${newHash ? `#${newHash}` : ''}`;
    }
}

// Ninja server URLs: the editor is /editor#id and fullscreen is
// /fullscreen#id. The page type comes from the server route, so only the
// project id in the hash (and the editor/fullscreen switch) is written back.
class NinjaRouter extends HashRouter {
    onpathchange () {
        if (location.pathname === '/fullscreen') this.onSetIsFullScreen(true);
    }

    generateURL ({projectId, isFullScreen}) {
        let hash = projectId && projectId !== '0' ? projectId : '';
        const hashQuery = location.hash.split('?')[1];
        if (hashQuery) hash += `?${hashQuery}`;
        return `${isFullScreen ? '/fullscreen' : '/editor'}${location.search}${hash ? `#${hash}` : ''}`;
    }
}

const getCanonicalLinkElement = () => {
    let el = document.querySelector('link[rel=canonical]');
    if (!el) {
        el = document.createElement('link');
        el.rel = 'canonical';
        document.head.appendChild(el);
    }
    return el;
};

class WildcardRouter extends Router {
    constructor (callbacks) {
        super(callbacks);
        this.root = process.env.ROOT;
    }

    onhashchange () {
        const hashProjectId = readHashProjectId();
        if (hashProjectId) {
            const ok = this.onSetProjectId(hashProjectId);
            if (ok) {
                // Completely remove the hash
                history.replaceState(null, null, `${location.pathname}${location.search}`);
            }
        } else {
            // Do not detect page type here as it is already setup by index.html, editor.html, etc.
            this.parseURL(false);
        }
    }

    onpathchange () {
        this.parseURL(true);
    }

    parseURL (detectPageType) {
        const path = location.pathname.substr(this.root.length);
        const parts = path.split('/');

        const parseProjectId = id => {
            if (id) {
                this.onSetProjectId(id);
            } else {
                this.onSetProjectId(defaultProjectId);
            }
        };

        const parsePageType = type => {
            if (!detectPageType) {
                return;
            }
            if (type === 'fullscreen') {
                this.onSetIsFullScreen(true);
            } else if (type === 'editor') {
                this.onSetIsPlayerOnly(false);
                this.onSetIsFullScreen(false);
            } else {
                this.onSetIsPlayerOnly(true);
                this.onSetIsFullScreen(false);
            }
        };

        if (+parts[0] && Number.isFinite(+parts[0])) {
            parseProjectId(parts[0]);
            parsePageType(parts[1]);
        } else {
            this.onSetProjectId(defaultProjectId);
            parsePageType(parts[0]);
        }
    }

    generateURL ({projectId, isPlayerOnly, isFullScreen}) {
        const parts = [];

        if (projectId !== '0') {
            parts.push(projectId);
        }
        if (isFullScreen) {
            parts.push('fullscreen');
        } else if (!isPlayerOnly) {
            parts.push('editor');
        }

        const path = `${this.root}${parts.join('/')}`;
        const canonical = `${location.origin}${this.root}${projectId === '0' ? '' : projectId}`;
        getCanonicalLinkElement().href = canonical;

        return `${path}${location.search}${location.hash}`;
    }
}

const routers = {
    none: Router,
    hash: HashRouter,
    filehash: FileHashRouter,
    wildcard: WildcardRouter
};

/**
 * Return the optimal Router for the current environment
 * @param {string} style Routing style name
 * @param {*} callbacks Redux callbacks
 * @returns {Router} The optimal router for the current environment
 */
const createRouter = (style, callbacks) => {
    const supportedStyles = ['none', 'hash'];

    // FileHashRouter is not supported on non-http(s) protocols.
    const isHTTP = location.protocol === 'http:' || location.protocol === 'https:';
    if (isHTTP) {
        supportedStyles.push('filehash');
    }

    // WildcardRouter is not supported if ROOT is not set.
    if (process.env.ROOT) {
        supportedStyles.push('wildcard');
    }

    if (!supportedStyles.includes(style)) {
        log.warn(`routing style is unknown or not supported: ${style}, falling back to hash`);
        style = 'hash';
    }

    // Served by the Ninja server at /editor or /fullscreen rather than *.html.
    if (style === 'filehash' && (location.pathname === '/editor' || location.pathname === '/fullscreen')) {
        return new NinjaRouter(callbacks);
    }

    if (Object.prototype.hasOwnProperty.call(routers, style)) {
        return new routers[style](callbacks);
    }

    throw new Error(`unknown router: ${style}`);
};

const TWStateManager = function (WrappedComponent) {
    class StateManagerComponent extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'handleHashChange',
                'handlePopState',
                'onSetProjectId',
                'onSetIsPlayerOnly',
                'onSetIsFullScreen'
            ]);
        }
        componentDidMount () {
            const urlParams = new URLSearchParams(location.search);

            if (urlParams.has('fps')) {
                const fps = +urlParams.get('fps');
                if (Number.isNaN(fps) || fps < 0) {
                    alert(this.props.intl.formatMessage(messages.invalidFPS));
                } else {
                    this.props.vm.setFramerate(fps);
                }
            } else if (urlParams.has('60fps')) {
                this.props.vm.setFramerate(60);
            }

            if (urlParams.has('interpolate')) {
                this.props.vm.setInterpolation(true);
            }

            if (urlParams.has('username')) {
                const username = urlParams.get('username');
                // Do not save username when loaded from URL
                this.doNotPersistUsername = username;
                this.props.onSetUsername(username);
            } else {
                const persistentUsername = this.props.isEmbedded ? null : getLocalStorage(USERNAME_KEY);
                if (persistentUsername === null) {
                    const randomUsername = generateRandomUsername();
                    this.props.onSetUsername(randomUsername);
                    if (this.props.isEmbedded) {
                        this.doNotPersistUsername = randomUsername;
                    }
                } else {
                    this.props.onSetUsername(persistentUsername);
                }
            }

            if (this.props.vm.renderer) {
                this.props.vm.renderer.setUseHighQualityRender(true);
            }

            if (urlParams.has('turbo')) {
                this.props.vm.setTurboMode(true);
            }

            this.props.vm.setCompilerOptions({
                // Warp Timer is an IDE convenience. Project viewers use the
                // normal runtime behavior unless a legacy URL explicitly
                // requests it.
                warpTimer: !this.props.isPlayerOnly ||
                    urlParams.has('stuck') || urlParams.has('warp_timer')
            });

            if (urlParams.has('nocompile')) {
                this.props.vm.setCompilerOptions({
                    enabled: false
                });
            }

            this.props.vm.setRuntimeOptions({
                maxClones: Infinity,
                fencing: false,
                miscLimits: false
            });

            for (const extension of urlParams.getAll('extension')) {
                this.props.vm.extensionManager.loadExtensionURL(extension);
            }

            const routerCallbacks = {
                onSetProjectId: this.onSetProjectId,
                onSetIsPlayerOnly: this.onSetIsPlayerOnly,
                onSetIsFullScreen: this.onSetIsFullScreen
            };
            this.router = createRouter(this.props.routingStyle, routerCallbacks);
            this.router.onhashchange();
            window.addEventListener('hashchange', this.handleHashChange);
            window.addEventListener('popstate', this.handlePopState);
        }
        componentDidUpdate (prevProps) {
            if (this.props.username !== prevProps.username && this.props.username !== this.doNotPersistUsername) {
                // TODO: this always restores the current username once at startup, which is unnecessary
                setLocalStorage(USERNAME_KEY, this.props.username);
            }

            if (
                this.props.reduxProjectId !== prevProps.reduxProjectId ||
                this.props.isPlayerOnly !== prevProps.isPlayerOnly ||
                this.props.isFullScreen !== prevProps.isFullScreen
            ) {
                const oldPath = `${location.pathname}${location.search}${location.hash}`;
                const routerState = {
                    projectId: this.props.reduxProjectId,
                    isPlayerOnly: this.props.isPlayerOnly,
                    isFullScreen: this.props.isFullScreen
                };
                const newPath = this.router.generateURL(routerState);
                // Replace rather than push: a project getting its id, or the
                // editor switching mode, shouldn't cost an extra Back press.
                if (newPath && newPath !== oldPath) {
                    history.replaceState(null, null, newPath);
                }
            }

            if (
                this.props.customStageSize !== prevProps.customStageSize ||
                this.props.runtimeOptions !== prevProps.runtimeOptions ||
                this.props.compilerOptions !== prevProps.compilerOptions ||
                this.props.highQualityPen !== prevProps.highQualityPen ||
                this.props.framerate !== prevProps.framerate ||
                this.props.interpolation !== prevProps.interpolation ||
                this.props.turbo !== prevProps.turbo
            ) {
                const searchParams = new URLSearchParams(location.search);
                const compilerOptions = this.props.compilerOptions;

                // Always remove legacy parameter
                searchParams.delete('60fps');

                const {width, height} = this.props.customStageSize;
                if (width === defaultStageSize.width && height === defaultStageSize.height) {
                    searchParams.delete('size');
                } else {
                    searchParams.set('size', `${width}x${height}`);
                }

                if (this.props.framerate === 30) {
                    searchParams.delete('fps');
                } else {
                    searchParams.set('fps', this.props.framerate);
                }

                if (this.props.interpolation) {
                    searchParams.set('interpolate', '');
                } else {
                    searchParams.delete('interpolate');
                }

                if (this.props.turbo) {
                    searchParams.set('turbo', '');
                } else {
                    searchParams.delete('turbo');
                }

                searchParams.delete('hqpen');

                if (compilerOptions.enabled) {
                    searchParams.delete('nocompile');
                }

                // Warp Timer is a Ninja default, so it does not belong in the
                // visible URL. Continue accepting legacy ?stuck links above,
                // but always normalize them to a clean URL.
                searchParams.delete('stuck');

                searchParams.delete('clones');
                searchParams.delete('offscreen');
                searchParams.delete('limitless');

                setSearchParams(searchParams);
            }
        }
        componentWillUnmount () {
            window.removeEventListener('hashchange', this.handleHashChange);
            window.removeEventListener('popstate', this.handlePopState);
        }
        handleHashChange () {
            this.router.onhashchange();
        }
        handlePopState () {
            this.router.onpathchange();
        }
        onSetProjectId (id) {
            if (`${id}` === `${this.props.reduxProjectId}`) {
                return true;
            }
            if (this.props.projectChanged) {
                if (!confirm('Are you sure you want to switch project?')) {
                    return false;
                }
            }
            this.props.onSetProjectId(id);
            return true;
        }
        onSetIsPlayerOnly (isPlayerOnly) {
            this.props.onSetIsPlayerOnly(isPlayerOnly);
        }
        onSetIsFullScreen (isFullScreen) {
            this.props.onSetIsFullScreen(isFullScreen);
        }
        render () {
            const {
                /* eslint-disable no-unused-vars */
                intl,
                customStageSize,
                isFullScreen,
                isPlayerOnly,
                isEmbedded,
                projectChanged,
                compilerOptions,
                runtimeOptions,
                highQualityPen,
                framerate,
                interpolation,
                turbo,
                onSetIsFullScreen,
                onSetIsPlayerOnly,
                onSetProjectId,
                onSetUsername,
                reduxProjectId,
                routingStyle,
                username,
                vm,
                /* eslint-enable no-unused-vars */
                ...props
            } = this.props;
            return (
                <WrappedComponent
                    {...props}
                />
            );
        }
    }
    StateManagerComponent.propTypes = {
        intl: intlShape,
        customStageSize: PropTypes.shape({
            width: PropTypes.number,
            height: PropTypes.number
        }),
        isFullScreen: PropTypes.bool,
        isPlayerOnly: PropTypes.bool,
        isEmbedded: PropTypes.bool,
        projectChanged: PropTypes.bool,
        projectId: PropTypes.string,
        compilerOptions: PropTypes.shape({
            enabled: PropTypes.bool,
            warpTimer: PropTypes.bool
        }),
        runtimeOptions: PropTypes.shape({
            miscLimits: PropTypes.bool,
            fencing: PropTypes.bool,
            maxClones: PropTypes.number
        }),
        highQualityPen: PropTypes.bool,
        framerate: PropTypes.number,
        interpolation: PropTypes.bool,
        turbo: PropTypes.bool,
        onSetIsFullScreen: PropTypes.func,
        onSetIsPlayerOnly: PropTypes.func,
        onSetProjectId: PropTypes.func,
        onSetUsername: PropTypes.func,
        reduxProjectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        routingStyle: PropTypes.oneOf(Object.keys(routers)),
        username: PropTypes.string,
        vm: PropTypes.instanceOf(VM)
    };
    StateManagerComponent.defaultProps = {
        routingStyle: process.env.ROUTING_STYLE
    };
    const mapStateToProps = state => ({
        customStageSize: state.scratchGui.customStageSize,
        isFullScreen: state.scratchGui.mode.isFullScreen,
        isPlayerOnly: state.scratchGui.mode.isPlayerOnly,
        isEmbedded: state.scratchGui.mode.isEmbedded,
        projectChanged: state.scratchGui.projectChanged,
        reduxProjectId: state.scratchGui.projectState.projectId,
        compilerOptions: state.scratchGui.tw.compilerOptions,
        runtimeOptions: state.scratchGui.tw.runtimeOptions,
        highQualityPen: state.scratchGui.tw.highQualityPen,
        framerate: state.scratchGui.tw.framerate,
        interpolation: state.scratchGui.tw.interpolation,
        turbo: state.scratchGui.vmStatus.turbo,
        username: state.scratchGui.tw.username,
        vm: state.scratchGui.vm
    });
    const mapDispatchToProps = dispatch => ({
        onSetIsFullScreen: isFullScreen => dispatch(setFullScreen(isFullScreen)),
        onSetIsPlayerOnly: isPlayerOnly => dispatch(setPlayer(isPlayerOnly)),
        onSetProjectId: projectId => dispatch(setProjectId(projectId)),
        onSetUsername: username => dispatch(setUsername(username))
    });
    return injectIntl(connect(
        mapStateToProps,
        mapDispatchToProps
    )(StateManagerComponent));
};

export {
    TWStateManager as default
};
