const DEFAULT_CONCURRENCY = 4;
const DEFAULT_RETRIES = 8;
const INITIAL_RETRY_DELAY = 250;
const MAX_RETRY_DELAY = 2000;

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const storeAsset = (storage, asset, retries, waitForRetry) => {
    const attempt = retry => storage.store(
        asset.assetType,
        asset.dataFormat,
        asset.data,
        asset.assetId
    ).then(response => {
        if (response.status !== 'ok') {
            return Promise.reject(response.code);
        }
        asset.clean = true;
    })
        .catch(error => {
            if (error !== 429 || retry >= retries) throw error;
            const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, retry), MAX_RETRY_DELAY);
            return waitForRetry(delay).then(() => attempt(retry + 1));
        });

    return attempt(0);
};

const storeProjectAssets = (storage, assets, options = {}) => {
    const pending = assets.filter(asset => !asset.clean);
    const concurrency = options.concurrency || DEFAULT_CONCURRENCY;
    const retries = typeof options.retries === 'number' ? options.retries : DEFAULT_RETRIES;
    const waitForRetry = options.wait || wait;
    let next = 0;

    const worker = () => {
        const index = next++;
        if (index >= pending.length) return Promise.resolve();
        return storeAsset(storage, pending[index], retries, waitForRetry).then(worker);
    };

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, pending.length); i++) {
        workers.push(worker());
    }
    return Promise.all(workers);
};

export default storeProjectAssets;
