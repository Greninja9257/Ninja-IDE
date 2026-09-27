// Name: Run Speed
// ID: ninjarunspeed
// Description: Slow motion and fast forward: run the whole project slower or faster, waits, glides, timers and sounds included.
// By: Ninja
// License: MPL-2.0

(function (Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        throw new Error('Run Speed must run unsandboxed');
    }

    const vm = Scratch.vm;
    const runtime = vm.runtime;
    const frameLoop = runtime.frameLoop;

    const MIN = 0.01;
    const MAX = 10;
    let speed = 1;
    let soundsFollow = true;

    /* ------------------------------------------------------------ the clock */

    // wait, glide, "say for secs", the timer and "sound until done" timing
    // all read runtime.currentMSecs, set once per step. At 50% it advances
    // half as fast as real time; at 200%, twice as fast.
    let lastReal = Date.now();
    let virtualNow = lastReal;
    runtime.updateCurrentMSecs = function () {
        const real = Date.now();
        virtualNow += (real - lastReal) * speed;
        lastReal = real;
        this.currentMSecs = virtualNow;
    };

    /* --------------------------------------------------------------- steps */

    // Faster: several steps each frame. Slower: a step only every few
    // frames, with interpolation drawing the motion in between so slow
    // motion stays smooth rather than jerky.
    const originalStep = runtime._step;
    let carry = 0;
    runtime._step = function () {
        if (speed === 1) return originalStep.call(this);
        carry += speed;
        const steps = Math.floor(carry);
        carry -= steps;
        for (let i = 0; i < steps; i++) originalStep.call(this);
    };

    // What the project itself asked for (framerate, interpolation), kept
    // while slow motion borrows them, and what gets saved with the project.
    let saved = null;
    const originalOptions = runtime._generateAllProjectOptions;
    runtime._generateAllProjectOptions = function () {
        const options = originalOptions.call(this);
        if (saved) {
            options.framerate = saved.framerate;
            options.interpolation = saved.interpolation;
        }
        return options;
    };

    const applySlowMotion = () => {
        if (speed < 1) {
            if (!saved) {
                saved = {framerate: frameLoop.framerate, interpolation: runtime.interpolationEnabled};
                // "Screen refresh rate" steps in time with the display and
                // can't be interpolated; 60 frames a second looks the same.
                if (frameLoop.framerate === 0) frameLoop.setFramerate(60);
                runtime.interpolationEnabled = true;
                frameLoop.setInterpolation(true);
            }
            // Interpolation spreads each step's motion over the whole gap
            // until the next one.
            const framerate = frameLoop.framerate || 60;
            runtime.currentStepTime = 1000 / (framerate * speed);
        } else if (saved) {
            runtime.interpolationEnabled = saved.interpolation;
            frameLoop.setInterpolation(saved.interpolation);
            if (frameLoop.framerate !== saved.framerate) frameLoop.setFramerate(saved.framerate);
            saved = null;
        }
    };

    // The framerate or interpolation changed in Settings during slow motion:
    // that's now what the project asked for; slow motion carries on on top.
    const settingChanged = (key, value) => {
        if (!saved) return;
        saved[key] = value;
        const keep = saved;
        saved = null;
        applySlowMotion();
        if (saved) {
            saved.framerate = keep.framerate;
            saved.interpolation = keep.interpolation;
        }
    };
    runtime.on('FRAMERATE_CHANGED', fps => settingChanged('framerate', fps));
    runtime.on('INTERPOLATION_CHANGED', on => settingChanged('interpolation', on));

    /* --------------------------------------------------------------- sound */

    // Sounds (and notes) play faster or slower, pitch included, like a tape.
    const soundFactor = () => (soundsFollow ? speed : 1);
    const patchedPlayers = new WeakSet();
    const allPlayers = new Set();
    const patchPlayerClass = player => {
        const proto = Object.getPrototypeOf(player);
        if (!proto || patchedPlayers.has(proto)) return;
        patchedPlayers.add(proto);
        const setRate = proto.setPlaybackRate;
        proto.setPlaybackRate = function (value) {
            this.ninjaBaseRate = value;
            allPlayers.add(this);
            return setRate.call(this, value * soundFactor());
        };
        const play = proto.play;
        proto.play = function (...args) {
            allPlayers.add(this);
            if (this.ninjaBaseRate === undefined) this.ninjaBaseRate = this.playbackRate || 1;
            setRate.call(this, this.ninjaBaseRate * soundFactor());
            return play.apply(this, args);
        };
        proto.ninjaRefreshRate = function () {
            setRate.call(this, (this.ninjaBaseRate === undefined ? 1 : this.ninjaBaseRate) * soundFactor());
        };
    };
    const findPlayers = () => {
        for (const target of runtime.targets) {
            const bank = target.sprite && target.sprite.soundBank;
            if (!bank) continue;
            for (const player of Object.values(bank.soundPlayers)) {
                patchPlayerClass(player);
                allPlayers.add(player);
            }
        }
    };
    const engine = runtime.audioEngine;
    if (engine && engine.decodeSoundPlayer) {
        const decode = engine.decodeSoundPlayer.bind(engine);
        engine.decodeSoundPlayer = (...args) => decode(...args).then(player => {
            patchPlayerClass(player);
            allPlayers.add(player);
            if (player.ninjaRefreshRate) player.ninjaRefreshRate();
            return player;
        });
    }
    findPlayers();
    const refreshSounds = () => {
        findPlayers();
        for (const player of allPlayers) {
            if (player.ninjaRefreshRate) player.ninjaRefreshRate();
        }
    };

    /* ------------------------------------------------------------ changing */

    const setSpeed = value => {
        const next = Math.max(MIN, Math.min(MAX, value));
        if (!Number.isFinite(next) || next === speed) return;
        runtime.updateCurrentMSecs(); // time so far counts at the old speed
        speed = next;
        carry = 0;
        applySlowMotion();
        refreshSounds();
    };

    // Stopping the project (or loading another) goes back to normal speed,
    // so a project can never leave itself stuck in slow motion. The green
    // flag stops everything first too, then starts: that isn't a stop.
    let pendingReset = null;
    runtime.on('PROJECT_STOP_ALL', () => {
        clearTimeout(pendingReset);
        pendingReset = setTimeout(() => setSpeed(1), 0);
    });
    runtime.on('PROJECT_START', () => clearTimeout(pendingReset));
    runtime.on('PROJECT_LOADED', () => setSpeed(1));

    const percent = value => Scratch.Cast.toNumber(value) / 100;

    class RunSpeed {
        getInfo () {
            return {
                id: 'ninjarunspeed',
                name: 'Run Speed',
                color1: '#4c97ff',
                color2: '#3373cc',
                color3: '#3373cc',
                blocks: [
                    {
                        opcode: 'setSpeed',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set run speed to [SPEED] %',
                        arguments: {
                            SPEED: {type: Scratch.ArgumentType.NUMBER, defaultValue: 50}
                        }
                    },
                    {
                        opcode: 'changeSpeed',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'change run speed by [DELTA] %',
                        arguments: {
                            DELTA: {type: Scratch.ArgumentType.NUMBER, defaultValue: 25}
                        }
                    },
                    {
                        opcode: 'getSpeed',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'run speed'
                    },
                    '---',
                    {
                        opcode: 'setSounds',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'sounds [MODE]',
                        arguments: {
                            MODE: {type: Scratch.ArgumentType.STRING, menu: 'soundModes', defaultValue: 'follow run speed'}
                        }
                    },
                    {
                        opcode: 'realTimer',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'real time since green flag'
                    }
                ],
                menus: {
                    soundModes: {
                        acceptReporters: false,
                        items: ['follow run speed', 'play at normal speed']
                    }
                }
            };
        }

        setSpeed (args) {
            setSpeed(percent(args.SPEED));
        }

        changeSpeed (args) {
            setSpeed(speed + percent(args.DELTA));
        }

        getSpeed () {
            return Math.round(speed * 1000) / 10;
        }

        setSounds (args) {
            soundsFollow = args.MODE !== 'play at normal speed';
            refreshSounds();
        }

        // The timer block runs at the run speed; this one doesn't.
        realTimer () {
            return Math.round((Date.now() - flagAt) / 10) / 100;
        }
    }

    let flagAt = Date.now();
    runtime.on('PROJECT_START', () => {
        flagAt = Date.now();
    });

    Scratch.extensions.register(new RunSpeed());
}(Scratch));
