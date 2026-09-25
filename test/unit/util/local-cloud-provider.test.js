import LocalCloudProvider from '../../../src/lib/local-cloud-provider';

describe('LocalCloudProvider', () => {
    let originalBroadcastChannel;
    let channel;

    beforeEach(() => {
        originalBroadcastChannel = global.BroadcastChannel;
        channel = {
            close: jest.fn(),
            postMessage: jest.fn()
        };
        global.BroadcastChannel = jest.fn(() => channel);
    });

    afterEach(() => {
        global.BroadcastChannel = originalBroadcastChannel;
    });

    test('confirms an update in the sending VM and broadcasts it to peers', () => {
        const vm = {postIOData: jest.fn()};
        const provider = new LocalCloudProvider(vm, 'test-session');

        provider.createVariable('score', 10);

        expect(vm.postIOData).toHaveBeenCalledWith('cloud', {
            varUpdate: {name: 'score', value: 10}
        });
        expect(channel.postMessage).toHaveBeenCalledWith({
            type: 'ninja-local-cloud-set',
            sessionId: 'test-session',
            name: 'score',
            value: 10
        });
    });

    test('applies updates received from another local editor', () => {
        const vm = {postIOData: jest.fn()};
        new LocalCloudProvider(vm, 'test-session'); // eslint-disable-line no-new

        channel.onmessage({data: {
            type: 'ninja-local-cloud-set',
            sessionId: 'test-session',
            name: 'score',
            value: 20
        }});

        expect(vm.postIOData).toHaveBeenCalledWith('cloud', {
            varUpdate: {name: 'score', value: 20}
        });
    });

    test('host editor relays an update between multiplayer frames', () => {
        const originalWindow = global.window;
        const originalLocation = global.location;
        const firstFrame = {postMessage: jest.fn()};
        const secondFrame = {postMessage: jest.fn()};
        let messageHandler;
        global.window = {
            addEventListener: (type, handler) => {
                if (type === 'message') messageHandler = handler;
            },
            frames: [firstFrame, secondFrame]
        };
        global.window.parent = global.window;
        global.location = {origin: 'http://localhost:8601'};

        const vm = {postIOData: jest.fn()};
        new LocalCloudProvider(vm, 'test-session'); // eslint-disable-line no-new
        const message = {
            type: 'ninja-local-cloud-set',
            sessionId: 'test-session',
            name: 'score',
            value: 30
        };
        messageHandler({data: message, origin: location.origin, source: firstFrame});

        expect(firstFrame.postMessage).not.toHaveBeenCalled();
        expect(secondFrame.postMessage).toHaveBeenCalledWith(message, location.origin);
        expect(vm.postIOData).toHaveBeenCalledWith('cloud', {
            varUpdate: {name: 'score', value: 30}
        });

        global.window = originalWindow;
        global.location = originalLocation;
    });
});
