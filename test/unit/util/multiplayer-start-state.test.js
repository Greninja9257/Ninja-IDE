import {
    captureMultiplayerStartState,
    getMultiplayerStartState
} from '../../../src/lib/multiplayer-start-state';

describe('multiplayer start state', () => {
    test('test windows reuse the state captured when the project loaded', async () => {
        const initial = new Uint8Array([1, 2, 3]).buffer;
        const current = new Uint8Array([9, 9, 9]).buffer;
        const vm = {
            saveProjectSb3: jest.fn()
                .mockResolvedValueOnce(initial)
                .mockResolvedValueOnce(current)
        };

        await captureMultiplayerStartState(vm);
        const firstWindow = await getMultiplayerStartState(vm);
        const secondWindow = await getMultiplayerStartState(vm);

        expect(vm.saveProjectSb3).toHaveBeenCalledTimes(1);
        expect(Array.from(new Uint8Array(firstWindow))).toEqual([1, 2, 3]);
        expect(Array.from(new Uint8Array(secondWindow))).toEqual([1, 2, 3]);
        expect(firstWindow).not.toBe(secondWindow);
    });
});
