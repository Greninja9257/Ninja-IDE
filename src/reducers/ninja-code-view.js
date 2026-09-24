/**
 * Whether the Code tab shows blocks or Python.
 *
 * Shared state because the control that changes it lives in the tab row, next
 * to Find, while the thing it changes is the workspace below.
 */

const SET_CODE_VIEW = 'ninja/codeView/SET';

const CODE_VIEW_BLOCKS = 'blocks';
const CODE_VIEW_PYTHON = 'python';

const STORAGE_KEY = 'ninja:codeView';

const readPersisted = () => {
    try {
        if (localStorage.getItem(STORAGE_KEY) === CODE_VIEW_PYTHON) return CODE_VIEW_PYTHON;
    } catch (err) {
        // Blocked storage just means the default.
    }
    return CODE_VIEW_BLOCKS;
};

const initialState = {
    view: readPersisted()
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    if (action.type === SET_CODE_VIEW) {
        return Object.assign({}, state, {view: action.view});
    }
    return state;
};

const setCodeView = function (view) {
    try {
        localStorage.setItem(STORAGE_KEY, view);
    } catch (err) {
        // Not remembering the choice is not worth failing over.
    }
    return {
        type: SET_CODE_VIEW,
        view: view
    };
};

export {
    reducer as default,
    initialState as ninjaCodeViewInitialState,
    setCodeView,
    CODE_VIEW_BLOCKS,
    CODE_VIEW_PYTHON
};
