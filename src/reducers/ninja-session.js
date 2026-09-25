// Signed-in account on the Ninja server, in the shape scratch-gui's menu bar
// already reads: state.session.session.user. `session` stays undefined until
// the server has answered, so nothing account-related flashes on load.
const SET_SESSION = 'ninja/session/SET_SESSION';
const SET_PROJECT_SHARED = 'ninja/session/SET_PROJECT_SHARED';

const initialState = {
    session: undefined, // eslint-disable-line no-undefined
    isShared: false
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SET_SESSION:
        return {...state, session: action.session};
    case SET_PROJECT_SHARED:
        return {...state, isShared: action.isShared};
    default:
        return state;
    }
};

const setSession = session => ({type: SET_SESSION, session});
const setProjectShared = isShared => ({type: SET_PROJECT_SHARED, isShared});

// Fetches /api/session and stores it. Signed-out visitors get {} so
// `sessionExists` is true and the menu bar shows Join / Sign in.
const loadSession = dispatch => fetch('/api/session', {credentials: 'same-origin'})
    .then(res => (res.ok ? res.json() : {user: null}))
    .catch(() => ({user: null}))
    .then(body => {
        dispatch(setSession(body.user ? {user: body.user} : {}));
        return body.user;
    });

export {
    reducer as default,
    initialState as ninjaSessionInitialState,
    setSession,
    setProjectShared,
    loadSession
};
