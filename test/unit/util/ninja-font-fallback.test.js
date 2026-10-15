import FontManager from 'scratch-vm/src/engine/tw-font-manager';
import {installFontFallback} from '../../../src/lib/ninja-font-fallback';

const makeVm = () => {
    const runtime = {
        renderer: {setCustomFonts: jest.fn()},
        storage: {AssetType: {Font: 'font'}},
        wrapAssetRequest: f => f()
    };
    runtime.fontManager = new FontManager(runtime);
    return {runtime};
};

describe('ninja font fallback', () => {
    test('a custom font whose file is missing becomes a system font with its fallback', async () => {
        const vm = makeVm();
        installFontFallback(vm);
        // The asset server has no copy of the font file either.
        vm.runtime.storage.load = jest.fn().mockResolvedValue(null);

        await vm.runtime.fontManager.deserialize([
            {system: false, family: 'Lost Font', fallback: 'sans-serif', md5ext: 'abc.ttf'}
        ], null, false);

        expect(vm.runtime.fontManager.getFonts()).toEqual([{
            system: true,
            name: 'Lost Font',
            family: '"Lost Font", sans-serif',
            data: null,
            format: null
        }]);
        expect(vm.runtime.fontManager.serializeJSON()).toEqual([
            {system: true, family: 'Lost Font', fallback: 'sans-serif'}
        ]);
        expect(vm.runtime.fontManager.serializeAssets()).toEqual([]);
    });

    test('custom fonts that load are left alone', () => {
        const vm = makeVm();
        installFontFallback(vm);
        const asset = {assetId: 'abc', dataFormat: 'ttf', encodeDataURI: () => 'data:font/ttf;base64,'};

        vm.runtime.fontManager.addCustomFont('Good Font', 'serif', asset);

        expect(vm.runtime.fontManager.serializeJSON()).toEqual([
            {system: false, family: 'Good Font', fallback: 'serif', md5ext: 'abc.ttf'}
        ]);
    });
});
