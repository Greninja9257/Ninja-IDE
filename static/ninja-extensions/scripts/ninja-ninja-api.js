// Name: Ninja API
// ID: ninjaapi
// Description: Get information about Ninja users, projects and studios, and who is signed in.
// By: Ninja
// License: MPL-2.0

(function (Scratch) {
    'use strict';

    // Projects run on Ninja itself, so the API is on the same site. Anywhere
    // else (a packaged project), use the public site.
    const ORIGIN = /(^|\.)greninja\.xyz$|^localhost$|^127\.0\.0\.1$/.test(location.hostname) ?
        location.origin : 'https://ninja.greninja.xyz';

    const cache = new Map();
    const CACHE_MS = 10000;

    // GET an API path as JSON, or null if it doesn't exist. Answers are kept
    // for a few seconds, so scripts asking for several details of the same
    // user or project in a row make one request.
    const get = async path => {
        const hit = cache.get(path);
        if (hit && Date.now() - hit.time < CACHE_MS) return hit.value;
        let value = null;
        try {
            const response = await fetch(`${ORIGIN}/api${path}`, {credentials: 'same-origin'});
            if (response.ok) value = await response.json();
        } catch (e) {
            value = null;
        }
        cache.set(path, {time: Date.now(), value});
        return value;
    };

    const name = value => encodeURIComponent(Scratch.Cast.toString(value).trim());
    const id = value => Math.max(0, Math.floor(Scratch.Cast.toNumber(value)));
    const absolute = url => (url ? new URL(url, ORIGIN).href : '');
    const date = time => (time ? new Date(time).toISOString() : '');
    const ids = list => JSON.stringify((list || []).map(item => item.id));

    class NinjaAPI {
        getInfo () {
            return {
                id: 'ninjaapi',
                name: 'Ninja API',
                color1: '#ff8c1a',
                color2: '#e67a00',
                color3: '#cc6d00',
                blocks: [
                    {blockType: Scratch.BlockType.LABEL, text: 'Signed in'},
                    {
                        opcode: 'signedIn',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: 'signed in to Ninja?'
                    },
                    {
                        opcode: 'me',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'my [INFO]',
                        arguments: {
                            INFO: {type: Scratch.ArgumentType.STRING, menu: 'meInfo', defaultValue: 'username'}
                        }
                    },
                    {
                        opcode: 'thisProject',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'this project\'s ID'
                    },
                    '---',
                    {blockType: Scratch.BlockType.LABEL, text: 'Users'},
                    {
                        opcode: 'userExists',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: 'user [USER] exists?',
                        arguments: {USER: {type: Scratch.ArgumentType.STRING, defaultValue: 'Greninja'}}
                    },
                    {
                        opcode: 'userInfo',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '[INFO] of user [USER]',
                        arguments: {
                            INFO: {type: Scratch.ArgumentType.STRING, menu: 'userInfo', defaultValue: 'about me'},
                            USER: {type: Scratch.ArgumentType.STRING, defaultValue: 'Greninja'}
                        }
                    },
                    {
                        opcode: 'userList',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '[LIST] of user [USER] page [PAGE]',
                        arguments: {
                            LIST: {type: Scratch.ArgumentType.STRING, menu: 'userLists', defaultValue: 'projects'},
                            USER: {type: Scratch.ArgumentType.STRING, defaultValue: 'Greninja'},
                            PAGE: {type: Scratch.ArgumentType.NUMBER, defaultValue: 1}
                        }
                    },
                    '---',
                    {blockType: Scratch.BlockType.LABEL, text: 'Projects'},
                    {
                        opcode: 'projectInfo',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '[INFO] of project [ID]',
                        arguments: {
                            INFO: {type: Scratch.ArgumentType.STRING, menu: 'projectInfo', defaultValue: 'title'},
                            ID: {type: Scratch.ArgumentType.NUMBER, defaultValue: 1}
                        }
                    },
                    {
                        opcode: 'explore',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '[MODE] projects page [PAGE]',
                        arguments: {
                            MODE: {type: Scratch.ArgumentType.STRING, menu: 'exploreMode', defaultValue: 'trending'},
                            PAGE: {type: Scratch.ArgumentType.NUMBER, defaultValue: 1}
                        }
                    },
                    {
                        opcode: 'search',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'search projects for [QUERY] page [PAGE]',
                        arguments: {
                            QUERY: {type: Scratch.ArgumentType.STRING, defaultValue: 'platformer'},
                            PAGE: {type: Scratch.ArgumentType.NUMBER, defaultValue: 1}
                        }
                    },
                    '---',
                    {blockType: Scratch.BlockType.LABEL, text: 'Studios'},
                    {
                        opcode: 'studioInfo',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '[INFO] of studio [ID]',
                        arguments: {
                            INFO: {type: Scratch.ArgumentType.STRING, menu: 'studioInfo', defaultValue: 'title'},
                            ID: {type: Scratch.ArgumentType.NUMBER, defaultValue: 1}
                        }
                    },
                    {
                        opcode: 'studioProjects',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'projects in studio [ID] page [PAGE]',
                        arguments: {
                            ID: {type: Scratch.ArgumentType.NUMBER, defaultValue: 1},
                            PAGE: {type: Scratch.ArgumentType.NUMBER, defaultValue: 1}
                        }
                    }
                ],
                menus: {
                    meInfo: {acceptReporters: false, items: ['username', 'user ID', 'profile picture URL']},
                    userInfo: {
                        acceptReporters: true,
                        items: ['about me', 'what I\'m working on', 'user ID', 'joined date', 'profile picture URL',
                            'project count', 'follower count', 'following count', 'favorite count',
                            'featured project ID']
                    },
                    userLists: {
                        acceptReporters: true,
                        items: ['projects', 'favorites', 'followers', 'following', 'studios']
                    },
                    projectInfo: {
                        acceptReporters: true,
                        items: ['title', 'creator', 'instructions', 'notes and credits', 'views', 'loves',
                            'favorites', 'remixes', 'shared date', 'modified date', 'thumbnail URL',
                            'remix of (project ID)']
                    },
                    exploreMode: {acceptReporters: true, items: ['trending', 'popular', 'recent']},
                    studioInfo: {
                        acceptReporters: true,
                        items: ['title', 'description', 'host', 'image URL', 'project count', 'follower count',
                            'curator count', 'created date']
                    }
                }
            };
        }

        async session () {
            // Never cached: signing in or out should show at once.
            try {
                const response = await fetch(`${ORIGIN}/api/session`, {credentials: 'same-origin'});
                return response.ok ? (await response.json()).user : null;
            } catch (e) {
                return null;
            }
        }

        async signedIn () {
            return Boolean(await this.session());
        }

        async me (args) {
            const user = await this.session();
            if (!user) return '';
            switch (args.INFO) {
            case 'user ID': return user.id;
            case 'profile picture URL': return absolute(user.avatar);
            default: return user.username;
            }
        }

        thisProject () {
            const match = /\/projects\/(\d+)/.exec(location.pathname) || /^#(\d+)/.exec(location.hash);
            return match ? Number(match[1]) : '';
        }

        async userExists (args) {
            return Boolean(await get(`/users/${name(args.USER)}`));
        }

        async userInfo (args) {
            const user = await get(`/users/${name(args.USER)}`);
            if (!user) return '';
            const counts = user.counts || {};
            switch (Scratch.Cast.toString(args.INFO)) {
            case 'about me': return user.bio || '';
            case 'what I\'m working on': return user.working_on || '';
            case 'user ID': return user.id;
            case 'joined date': return date(user.created_at);
            case 'profile picture URL': return absolute(user.avatar);
            case 'project count': return counts.projects || 0;
            case 'follower count': return counts.followers || 0;
            case 'following count': return counts.following || 0;
            case 'favorite count': return counts.favorites || 0;
            case 'featured project ID': return user.featured ? user.featured.id : '';
            default: return '';
            }
        }

        async userList (args) {
            const list = Scratch.Cast.toString(args.LIST);
            if (!['projects', 'favorites', 'followers', 'following', 'studios'].includes(list)) return '[]';
            const offset = Math.max(0, id(args.PAGE) - 1) * 20;
            const items = await get(`/users/${name(args.USER)}/${list}?limit=20&offset=${offset}`);
            if (!Array.isArray(items)) return '[]';
            // People are listed by name; projects and studios by ID.
            if (list === 'followers' || list === 'following') {
                return JSON.stringify(items.map(item => item.username || (item.user && item.user.username)));
            }
            return ids(items);
        }

        async projectInfo (args) {
            const project = await get(`/projects/${id(args.ID)}/meta`);
            if (!project) return '';
            const stats = project.stats || {};
            const history = project.history || {};
            switch (Scratch.Cast.toString(args.INFO)) {
            case 'title': return project.title;
            case 'creator': return project.author ? project.author.username : '';
            case 'instructions': return project.instructions || '';
            case 'notes and credits': return project.description || '';
            case 'views': return stats.views || 0;
            case 'loves': return stats.loves || 0;
            case 'favorites': return stats.favorites || 0;
            case 'remixes': return stats.remixes || 0;
            case 'shared date': return date(history.shared);
            case 'modified date': return date(history.modified);
            case 'thumbnail URL': return absolute(`/api/projects/${project.id}/thumbnail`);
            case 'remix of (project ID)': return project.remix && project.remix.parent ? project.remix.parent.id : '';
            default: return '';
            }
        }

        async explore (args) {
            const mode = ['trending', 'popular', 'recent'].includes(args.MODE) ? args.MODE : 'trending';
            const offset = Math.max(0, id(args.PAGE) - 1) * 20;
            return ids(await get(`/explore/projects?mode=${mode}&limit=20&offset=${offset}`));
        }

        async search (args) {
            const offset = Math.max(0, id(args.PAGE) - 1) * 20;
            return ids(await get(`/explore/projects?mode=popular&q=${name(args.QUERY)}&limit=20&offset=${offset}`));
        }

        async studioInfo (args) {
            const studio = await get(`/studios/${id(args.ID)}`);
            if (!studio) return '';
            const counts = studio.counts || {};
            switch (Scratch.Cast.toString(args.INFO)) {
            case 'title': return studio.title;
            case 'description': return studio.description || '';
            case 'host': return studio.host ? studio.host.username : '';
            case 'image URL': return absolute(studio.image);
            case 'project count': return counts.projects || 0;
            case 'follower count': return counts.followers || 0;
            case 'curator count': return counts.curators || 0;
            case 'created date': return date(studio.created_at);
            default: return '';
            }
        }

        async studioProjects (args) {
            const offset = Math.max(0, id(args.PAGE) - 1) * 20;
            return ids(await get(`/studios/${id(args.ID)}/projects?limit=20&offset=${offset}`));
        }
    }

    Scratch.extensions.register(new NinjaAPI());
}(Scratch));
