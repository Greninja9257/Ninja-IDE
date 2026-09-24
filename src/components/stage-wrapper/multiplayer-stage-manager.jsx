import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import VM from 'scratch-vm';

import styles from './multiplayer-stage-manager.css';

const MAX_WINDOWS = 4;

class MultiplayerStageManager extends React.Component {
    constructor (props) {
        super(props);
        this.sessionId = window.__ninjaLocalCloudSession ||
            (window.__ninjaLocalCloudSession = Math.random().toString(36)
                .slice(2));
        this.nextClientId = 1;
        this.state = {
            clients: [],
            adding: false,
            viewport: this.getViewport()
        };
        this.handleResize = this.handleResize.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
        this.handleAddWindow = this.handleAddWindow.bind(this);
        this.setManagerRef = this.setManagerRef.bind(this);
        this.handleFrameLoad = this.handleFrameLoad.bind(this);
    }
    componentDidMount () {
        window.addEventListener('resize', this.handleResize);
        window.addEventListener('message', this.handleMessage);
        this.updateStageViewport();
    }
    componentDidUpdate () {
        this.updateStageViewport();
    }
    componentWillUnmount () {
        this.unmounted = true;
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('message', this.handleMessage);
        delete window.__ninjaStageViewport;
        window.dispatchEvent(new Event('resize'));
    }
    getViewport () {
        return {width: window.innerWidth, height: window.innerHeight};
    }
    handleResize () {
        this.setState({viewport: this.getViewport()});
    }
    setManagerRef (element) {
        this.manager = element;
    }
    handleMessage (event) {
        if (event.origin !== location.origin || !event.data || event.data.type !== 'ninja-multiplayer-close') return;
        const frame = Array.from(this.manager.querySelectorAll('iframe'))
            .find(element => element.contentWindow === event.source);
        if (!frame) return;
        const id = Number(frame.dataset.clientId);
        this.setState(state => ({clients: state.clients.filter(client => client.id !== id)}));
    }
    getLayout () {
        const count = this.state.clients.length + 1;
        const columns = count === 4 ? 2 : count;
        const rows = count === 4 ? 2 : 1;
        const {width, height} = this.state.viewport;
        return Array.from({length: count}, (_, index) => ({
            x: Math.round((index % columns) * width / columns),
            y: Math.round(Math.floor(index / columns) * height / rows),
            width: Math.round(width / columns),
            height: Math.round(height / rows)
        }));
    }
    getCellStyle (rect) {
        return {
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height
        };
    }
    updateStageViewport () {
        const rect = this.getLayout()[0];
        const previous = window.__ninjaStageViewport;
        if (!previous || previous.width !== rect.width || previous.height !== rect.height) {
            window.__ninjaStageViewport = {width: rect.width, height: rect.height};
            window.dispatchEvent(new Event('resize'));
        }
    }
    async handleAddWindow () {
        if (this.state.adding || this.state.clients.length + 1 >= MAX_WINDOWS) return;
        this.setState({adding: true});
        try {
            const project = await this.props.vm.saveProjectSb3('arraybuffer');
            if (this.unmounted) return;
            const client = {
                id: this.nextClientId++,
                project,
                started: this.props.isProjectStarted,
                running: this.props.isProjectRunning
            };
            this.setState(state => ({clients: [...state.clients, client], adding: false}));
        } catch (e) {
            if (!this.unmounted) this.setState({adding: false});
        }
    }
    handleFrameLoad (event) {
        const frame = event.currentTarget;
        const id = Number(frame.dataset.clientId);
        const client = this.state.clients.find(item => item.id === id);
        if (!client) return;
        const project = client.project.slice(0);
        frame.contentWindow.postMessage({
            type: 'ninja-multiplayer-load',
            project,
            started: client.started,
            running: client.running
        }, location.origin, [project]);
    }
    renderClient (client, rect, index) {
        return (
            <div
                className={styles.cell}
                key={client.id}
                style={this.getCellStyle(rect)}
            >
                <iframe
                    allow="camera; microphone; autoplay"
                    className={styles.frame}
                    data-client-id={client.id}
                    src={`${process.env.ROOT}embed.html?multiplayer=1&cloud_session=${this.sessionId}`}
                    title={`${index + 2}`}
                    onLoad={this.handleFrameLoad}
                />
            </div>
        );
    }
    render () {
        const {clients, adding} = this.state;
        const layout = this.getLayout();
        return (
            <div
                className={styles.manager}
                ref={this.setManagerRef}
            >
                <div
                    className={styles.cell}
                    style={this.getCellStyle(layout[0])}
                >
                    {this.props.children({
                        canAddWindow: !adding && clients.length + 1 < MAX_WINDOWS,
                        onAddWindow: this.handleAddWindow
                    })}
                </div>
                {clients.map((client, index) => this.renderClient(client, layout[index + 1], index))}
            </div>
        );
    }
}

MultiplayerStageManager.propTypes = {
    children: PropTypes.func.isRequired,
    isProjectRunning: PropTypes.bool.isRequired,
    isProjectStarted: PropTypes.bool.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => ({
    isProjectRunning: state.scratchGui.vmStatus.running,
    isProjectStarted: state.scratchGui.vmStatus.started
});

export default connect(mapStateToProps)(MultiplayerStageManager);
