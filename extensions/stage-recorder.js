// Name: Stage Recorder
// ID: ninjastagerecorder
// Description: Record the stage as a video, starting and stopping whenever the project says, and save it as a file.
// By: Ninja
// License: MPL-2.0

(function (Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        throw new Error('Stage Recorder must run unsandboxed');
    }

    const vm = Scratch.vm;
    const runtime = vm.runtime;

    // Chrome and Firefox record WebM (VP9 plays back more widely than VP8);
    // Safari only records MP4.
    const MIME_TYPE = typeof MediaRecorder === 'undefined' ? null : [
        'video/webm; codecs=vp9',
        'video/webm',
        'video/mp4'
    ].find(type => MediaRecorder.isTypeSupported(type));
    const FILE_EXTENSION = MIME_TYPE ? MIME_TYPE.split(';')[0].split('/')[1] : 'webm';

    let recorder = null;
    let chunks = [];
    let audioOut = null; // where the project's sound is copied for the recording
    let startedAt = 0; // when the current unpaused stretch began
    let recordedMs = 0; // time recorded before that stretch

    const recording = () => Boolean(recorder) && recorder.state !== 'inactive';
    const paused = () => Boolean(recorder) && recorder.state === 'paused';

    const length = () => {
        if (!recorder) return 0;
        return recordedMs + (recorder.state === 'recording' ? Date.now() - startedAt : 0);
    };

    const fileName = name => {
        const base = String(name).trim()
            .replace(/[\\/:*?"<>|]+/g, '_') || 'recording';
        return /\.[a-z0-9]{2,4}$/i.test(base) ? base : `${base}.${FILE_EXTENSION}`;
    };

    const disconnectAudio = () => {
        if (!audioOut) return;
        try {
            runtime.audioEngine.inputNode.disconnect(audioOut);
        } catch (e) {
            // already disconnected
        }
        audioOut = null;
    };

    const start = withSound => {
        if (recording() || !MIME_TYPE) return;
        const canvas = runtime.renderer && runtime.renderer.canvas;
        if (!canvas || !canvas.captureStream) return;
        const stream = new MediaStream(canvas.captureStream().getVideoTracks());
        const engine = runtime.audioEngine;
        if (withSound && engine && engine.audioContext && engine.inputNode) {
            audioOut = engine.audioContext.createMediaStreamDestination();
            engine.inputNode.connect(audioOut);
            for (const track of audioOut.stream.getAudioTracks()) stream.addTrack(track);
        }
        chunks = [];
        recordedMs = 0;
        startedAt = Date.now();
        recorder = new MediaRecorder(stream, {mimeType: MIME_TYPE});
        recorder.ondataavailable = e => {
            if (e.data && e.data.size) chunks.push(e.data);
        };
        recorder.start(1000);
    };

    // Stops, and resolves with the video (or null if nothing was recording).
    const finish = () => new Promise(resolve => {
        if (!recording()) {
            resolve(null);
            return;
        }
        const current = recorder;
        current.onstop = () => {
            for (const track of current.stream.getTracks()) track.stop();
            disconnectAudio();
            const blob = chunks.length ? new Blob(chunks, {type: MIME_TYPE}) : null;
            chunks = [];
            if (recorder === current) recorder = null;
            resolve(blob);
        };
        recordedMs = length();
        current.stop();
    });

    const save = async name => {
        const blob = await finish();
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        try {
            await Scratch.download(url, fileName(name));
        } finally {
            // Give the browser time to start the download before letting go.
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
    };

    // Another project: whatever was being recorded isn't wanted.
    runtime.on('PROJECT_LOADED', () => {
        finish();
    });

    class StageRecorder {
        getInfo () {
            return {
                id: 'ninjastagerecorder',
                name: 'Stage Recorder',
                color1: '#e5484d',
                color2: '#cc3a3f',
                color3: '#b32f34',
                blocks: [
                    {
                        opcode: 'startRecording',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'start recording stage [SOUND]',
                        arguments: {
                            SOUND: {type: Scratch.ArgumentType.STRING, menu: 'sound', defaultValue: 'with sound'}
                        }
                    },
                    {
                        opcode: 'stopAndSave',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'stop recording and save as [NAME]',
                        arguments: {
                            NAME: {type: Scratch.ArgumentType.STRING, defaultValue: 'recording'}
                        }
                    },
                    {
                        opcode: 'recordFor',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'record stage for [SECS] seconds [SOUND] and save as [NAME]',
                        arguments: {
                            SECS: {type: Scratch.ArgumentType.NUMBER, defaultValue: 5},
                            SOUND: {type: Scratch.ArgumentType.STRING, menu: 'sound', defaultValue: 'with sound'},
                            NAME: {type: Scratch.ArgumentType.STRING, defaultValue: 'clip'}
                        }
                    },
                    '---',
                    {
                        opcode: 'pauseRecording',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'pause recording'
                    },
                    {
                        opcode: 'resumeRecording',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'resume recording'
                    },
                    {
                        opcode: 'discardRecording',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'stop recording without saving'
                    },
                    '---',
                    {
                        opcode: 'isRecording',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: 'recording?'
                    },
                    {
                        opcode: 'isPaused',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: 'recording paused?'
                    },
                    {
                        opcode: 'recordingLength',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'recording length'
                    }
                ],
                menus: {
                    sound: {
                        acceptReporters: false,
                        items: ['with sound', 'without sound']
                    }
                }
            };
        }

        startRecording (args) {
            start(args.SOUND !== 'without sound');
        }

        stopAndSave (args) {
            return save(args.NAME);
        }

        // Waits for the whole recording, so the script carries on once it's saved.
        recordFor (args) {
            if (recording()) return;
            const secs = Math.max(0, Math.min(600, Scratch.Cast.toNumber(args.SECS)));
            start(args.SOUND !== 'without sound');
            if (!recording()) return;
            const mine = recorder;
            return new Promise(resolve => setTimeout(resolve, secs * 1000))
                .then(() => (recorder === mine ? save(args.NAME) : null));
        }

        pauseRecording () {
            if (!recorder || recorder.state !== 'recording') return;
            recordedMs = length();
            recorder.pause();
        }

        resumeRecording () {
            if (!paused()) return;
            startedAt = Date.now();
            recorder.resume();
        }

        discardRecording () {
            return finish().then(() => {});
        }

        isRecording () {
            return recording();
        }

        isPaused () {
            return paused();
        }

        // In seconds, not counting time spent paused.
        recordingLength () {
            return Math.round(length() / 10) / 100;
        }
    }

    Scratch.extensions.register(new StageRecorder());
}(Scratch));
