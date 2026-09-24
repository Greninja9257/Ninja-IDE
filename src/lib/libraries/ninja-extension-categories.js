// Library filter category for each extension. Gallery extensions are keyed by
// "<source>:<source id>"; built-in extensions by their extension ID.

const CATEGORIES = {
    graphics: [
        'pen',
        'TurboWarp:text', 'TurboWarp:SPcamera', 'TurboWarp:theshovelcanvaseffects',
        'TurboWarp:xeltallivclipblend', 'TurboWarp:shovelcss', 'TurboWarp:SPASfontManager',
        'TurboWarp:iframe', 'TurboWarp:images', 'TurboWarp:lmsLooksPlus', 'TurboWarp:nkmoremotion',
        'TurboWarp:penP', 'TurboWarp:lbdrawtest', 'TurboWarp:xeltallivSimple3D', 'TurboWarp:lmsSkins',
        'TurboWarp:stretch', 'TurboWarp:jeremygamerTweening', 'TurboWarp:lmsVideo', 'TurboWarp:videoSprites',
        'SharkPool:Added-Motion', 'SharkPool:Animations', 'SharkPool:Color-Master', 'SharkPool:Display-Text',
        'SharkPool:GIF-Manager', 'SharkPool:Image-Editor', 'SharkPool:Image-Effects', 'SharkPool:Layer-Control',
        'SharkPool:Looks-Expanded', 'SharkPool:Particle-Engine', 'SharkPool:Particle-Tools',
        'SharkPool:Pen-Papers', 'SharkPool:QR-Codes', 'SharkPool:Renderer-Control', 'SharkPool:Speech-Bubbles',
        'SharkPool:Sprite-Effects', 'SharkPool:Sprite-Parenting', 'SharkPool:Sty-Lists',
        'SharkPool:SVG-Spritesheets', 'SharkPool:Tile-Grids', 'SharkPool:Turbo-Skins'
    ],
    sound: [
        'music', 'text2speech',
        'TurboWarp:lmsSoundExpanded', 'TurboWarp:SPtuneShark3',
        'SharkPool:MIDI-Tools', 'SharkPool:Recording', 'SharkPool:Sound-Waves', 'SharkPool:Text-to-Speech-V2'
    ],
    data: [
        'neuralnetworks',
        'TurboWarp:truefantombase', 'TurboWarp:skyhigh173BigInt', 'TurboWarp:Bitwise', 'TurboWarp:lmsCast',
        'TurboWarp:qxsckdataanalysis', 'TurboWarp:verctedictionaries', 'TurboWarp:Encoding', 'TurboWarp:files',
        'TurboWarp:dogeiscutformatnumbers', 'TurboWarp:nonameawagraph', 'TurboWarp:clayhtmlencode',
        'TurboWarp:skyhigh173JSON', 'TurboWarp:lmsListTools', 'TurboWarp:localstorage',
        'TurboWarp:shovellzcompress', 'TurboWarp:truefantommath', 'TurboWarp:nonameawacomparisons',
        'TurboWarp:truefantomregexp', 'TurboWarp:0832rxfs2', 'TurboWarp:lmsTempVars2', 'TurboWarp:strings',
        'TurboWarp:sipctime', 'TurboWarp:qxsckvarandlist', 'TurboWarp:mbwxml', 'TurboWarp:cst1229zip',
        'SharkPool:Files-Expanded', 'SharkPool:More-Operators', 'SharkPool:Perlin-Noise', 'SharkPool:Seeds',
        'SharkPool:Since-2000', 'SharkPool:Swift-JSON', 'SharkPool:Time-Calculation', 'SharkPool:Timezones',
        'SharkPool:Variables-Expanded'
    ],
    input: [
        'videoSensing', 'faceSensing', 'makeymakey', 'microbit', 'ev3', 'boost', 'wedo2', 'gdxfor',
        'TurboWarp:AR', 'TurboWarp:shovelColorPicker', 'TurboWarp:faceSensing', 'TurboWarp:Gamepad',
        'TurboWarp:samuelloufgeolocation', 'TurboWarp:cubesterKeySimulation', 'TurboWarp:mobilekeyboard0419',
        'TurboWarp:MouseCursor', 'TurboWarp:pointerlock', 'TurboWarp:obviousalexsensing',
        'SharkPool:Camera-Sensing-Plus', 'SharkPool:Hyper-Sense', 'SharkPool:Popup-Phoenix'
    ],
    network: [
        'translate',
        'TurboWarp:fetch', 'TurboWarp:gsaHTTPRequests', 'TurboWarp:truefantomnetwork', 'TurboWarp:steamworks',
        'TurboWarp:cubesterWebhooks', 'TurboWarp:gsaWebsocket',
        'SharkPool:Fetch-Plus'
    ],
    utility: [
        'procedures_enable_return', 'tw', 'custom_extension',
        'TurboWarp:lmsAssets', 'TurboWarp:griffpatch', 'TurboWarp:fullscreen0419', 'TurboWarp:clipboard',
        'TurboWarp:lmsclonesplus', 'TurboWarp:lmscomments', 'TurboWarp:nkcontrols', 'TurboWarp:dtbyxeroname',
        'TurboWarp:lmsutilsblocks', 'TurboWarp:SPmessagePlus', 'TurboWarp:lmsMoreEvents', 'TurboWarp:lmsTimers',
        'TurboWarp:navigatorinfo', 'TurboWarp:mdwaltersnotifications', 'TurboWarp:RixxyX',
        'TurboWarp:runtimeoptions', 'TurboWarp:zxmushroom63searchparams', 'TurboWarp:ShovelUtils',
        'TurboWarp:utilities', 'TurboWarp:dninwakelock', 'TurboWarp:cubesterWindowControls',
        'SharkPool:Advanced-Messages', 'SharkPool:Better-Comments', 'SharkPool:DOM-Selector',
        'SharkPool:Dropdown-Maker', 'SharkPool:Events-Plus', 'SharkPool:Extra-Controls',
        'SharkPool:Lazy-Collisions', 'SharkPool:My-Blocks-Plus', 'SharkPool:Pause', 'SharkPool:Rigidbodies',
        'SharkPool:Runtime-Events', 'SharkPool:Scenes', 'SharkPool:Script-Control', 'SharkPool:Sharktilities',
        'SharkPool:Sprite-Panel'
    ],
    niche: [
        // One outside service
        'TurboWarp:GameJoltAPI', 'TurboWarp:NGIO', 'SharkPool:Newgrounds-Audio', 'TurboWarp:itch',
        'SharkPool:Spotify', 'SharkPool:SoundCloud-API', 'SharkPool:YouTube-Operations',
        'SharkPool:Google-Spreadsheets', 'TurboWarp:longvegdictionary', 'SharkPool:Money-Utilities',
        'TurboWarp:cloudlink', 'SharkPool:Community-Spotlight',
        // Only meaningful on the Scratch website
        'TurboWarp:nexuskittensgrab', 'SharkPool:Scratch-Utilities', 'TurboWarp:clouddataping',
        'TurboWarp:numericalencoding2',
        // One platform
        'TurboWarp:alestorenfc', 'TurboWarp:pwldevvibration', 'TurboWarp:battery',
        // Jokes, oddities and trivial blocks
        'TurboWarp:lmsmcutils', 'SharkPool:Pixel-Utilities', 'SharkPool:Captchas', 'TurboWarp:nishiowoDectalk',
        'TurboWarp:lmsAllMenus', 'TurboWarp:lmsHackedBlocks', 'TurboWarp:truefantomcouplers',
        'TurboWarp:shreder95resolution', 'TurboWarp:sipcconsole', 'TurboWarp:xmerclosecontrol'
    ]
};

const categoryByKey = Object.entries(CATEGORIES).reduce((result, [category, keys]) => {
    keys.forEach(key => {
        result[key] = category;
    });
    return result;
}, {});

const getExtensionCategory = key => categoryByKey[key];

export {
    CATEGORIES,
    getExtensionCategory
};
