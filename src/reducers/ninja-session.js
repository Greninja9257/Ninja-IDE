// Signed-in account on the Ninja server, in the shape scratch-gui's menu bar
// already reads: state.session.session.user. `session` stays undefined until
// the server has answered, so nothing account-related flashes on load.
const SET_SESSION = 'ninja/session/SET_SESSION';
const SET_PROJECT_SHARED = 'ninja/session/SET_PROJECT_SHARED';
const SET_PROJECT_TEAM = 'ninja/session/SET_PROJECT_TEAM';
const SET_COLLAB_PEERS = 'ninja/session/SET_COLLAB_PEERS';

const initialState = {
    session: undefined, // eslint-disable-line no-undefined
    isShared: false,
    // People working on the open project with its owner, and whether the
    // signed-in account is one of them.
    collaborators: [],
    isCollaborator: false,
    isInvited: false,
    // Everyone in the live room, this account included, with the sprite
    // each is looking at. Empty when not live.
    collabPeers: []
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SET_SESSION:
        return {...state, session: action.session};
    case SET_PROJECT_SHARED:
        return {...state, isShared: action.isShared};
    case SET_PROJECT_TEAM:
        return {
            ...state,
            collaborators: action.collaborators,
            isCollaborator: action.isCollaborator,
            isInvited: action.isInvited
        };
    case SET_COLLAB_PEERS:
        return {...state, collabPeers: action.peers};
    default:
        return state;
    }
};

const setSession = session => ({type: SET_SESSION, session});
const setProjectShared = isShared => ({type: SET_PROJECT_SHARED, isShared});
const setProjectTeam = (collaborators, isCollaborator, isInvited) => ({
    type: SET_PROJECT_TEAM,
    collaborators,
    isCollaborator,
    isInvited: Boolean(isInvited)
});
const setCollabPeers = peers => ({type: SET_COLLAB_PEERS, peers});

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
    setProjectTeam,
    setCollabPeers,
    loadSession
};
