import storeProjectAssets from '../../../src/lib/store-project-assets';

const makeAssets = count => Array.from({length: count}, (_, index) => ({
    assetType: 'image',
    dataFormat: 'svg',
    data: index,
    assetId: String(index),
    clean: false
}));

describe('storeProjectAssets', () => {
    test('limits concurrent asset uploads', async () => {
        const assets = makeAssets(12);
        let active = 0;
        let maximumActive = 0;
        const resolvers = [];
        const storage = {
            store: jest.fn(() => new Promise(resolve => {
                active++;
                maximumActive = Math.max(maximumActive, active);
                resolvers.push(() => {
                    active--;
                    resolve({status: 'ok'});
                });
            }))
        };

        const storing = storeProjectAssets(storage, assets, {concurrency: 3});
        while (resolvers.length || storage.store.mock.calls.length < assets.length) {
            const resolve = resolvers.shift();
            if (resolve) resolve();
            await Promise.resolve();
        }
        await storing;

        expect(maximumActive).toBe(3);
        expect(storage.store).toHaveBeenCalledTimes(12);
        expect(assets.every(asset => asset.clean)).toBe(true);
    });

    test('retries rate-limited uploads', async () => {
        const asset = makeAssets(1)[0];
        const storage = {
            store: jest.fn()
                .mockRejectedValueOnce(429)
                .mockRejectedValueOnce(429)
                .mockResolvedValue({status: 'ok'})
        };
        const wait = jest.fn(() => Promise.resolve());

        await storeProjectAssets(storage, [asset], {wait});

        expect(storage.store).toHaveBeenCalledTimes(3);
        expect(wait).toHaveBeenCalledTimes(2);
        expect(asset.clean).toBe(true);
    });

    test('stores more assets than the server burst limit', async () => {
        const assets = makeAssets(250);
        const attempts = new Set();
        const storage = {
            store: jest.fn((assetType, dataFormat, data, assetId) => {
                if (Number(assetId) >= 200 && !attempts.has(assetId)) {
                    attempts.add(assetId);
                    return Promise.reject(429);
                }
                return Promise.resolve({status: 'ok'});
            })
        };

        await storeProjectAssets(storage, assets, {wait: () => Promise.resolve()});

        expect(storage.store).toHaveBeenCalledTimes(300);
        expect(assets.every(asset => asset.clean)).toBe(true);
    });

    test('does not retry other failures', async () => {
        const asset = makeAssets(1)[0];
        const storage = {store: jest.fn(() => Promise.reject(500))};

        await expect(storeProjectAssets(storage, [asset])).rejects.toBe(500);
        expect(storage.store).toHaveBeenCalledTimes(1);
        expect(asset.clean).toBe(false);
    });
});
