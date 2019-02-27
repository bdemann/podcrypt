import { createStore } from 'redux';
import { get, set } from 'idb-keyval';

export const StorePromise = prepareStore();

async function prepareStore() {
    const persistedState = await get('state');

    const InitialState = persistedState || {
        currentRoute: {
            pathname: '/',
            search: '',
            query: {}
        },
        showMainMenu: false,
        currentEpisodeGuid: null,
        playlist: [],
        currentPlaylistIndex: 0,
        podcasts: {},
        episodes: {},
        payoutAmountDollars: 10
    };
    
    const RootReducer = (state=InitialState, action: any) => {
        if (action.type === 'CHANGE_CURRENT_ROUTE') {
            return {
                ...state,
                currentRoute: action.currentRoute
            };
        }
    
        if (action.type === 'TOGGLE_SHOW_MAIN_MENU') {
            return {
                ...state,
                showMainMenu: !state.showMainMenu
            }
        }
    
        // if (action.type === 'PLAY_EPISODE') {
        //     return {
        //         ...state,
        //         currentEpisodeGuid: action.episode.guid,
        //         episodes: {
        //             ...state.episodes,
        //             [action.episode.guid]: {
        //                 ...state.episodes[action.episode.guid],
        //                 ...action.episode
        //             }
        //         }
        //     };
        // }
    
        // TODO when adding new episodes and podcasts, we might overwrite important data...use more intelligent defaults
        if (action.type === 'SUBSCRIBE_TO_PODCAST') {
            return {
                ...state,
                podcasts: {
                    ...state.podcasts,
                    [action.podcast.feedUrl]: {
                        ...state.podcasts[action.podcast.feedUrl],
                        ...action.podcast
                    }
                }
            };
        }
    
        if (action.type === 'ADD_EPISODE_TO_PLAYLIST') {
            return {
                ...state,
                playlist: [...state.playlist, action.episode.guid],
                episodes: {
                    ...state.episodes,
                    [action.episode.guid]: {
                        ...state.episodes[action.episode.guid],
                        ...action.episode
                    }
                },
                podcasts: {
                    ...state.podcasts,
                    [action.podcast.feedUrl]: {
                        ...state.podcasts[action.podcast.feedUrl],
                        ...action.podcast,
                        episodes: [...(state.podcasts[action.podcast.feedUrl] ? state.podcasts[action.podcast.feedUrl].episodes : []), action.episode.guid]
                    }
                }
            };
        }
    
        if (action.type === 'PLAY_EPISODE_FROM_PLAYLIST') {
            const newCurrentPlaylistIndex = action.playlistIndex;
            const newCurrentEpisodeGuid = state.playlist[newCurrentPlaylistIndex];
    
            if (newCurrentEpisodeGuid === state.currentEpisodeGuid) {
                return {
                    ...state,
                    episodes: {
                        ...state.episodes,
                        [state.currentEpisodeGuid]: {
                            ...state.episodes[state.currentEpisodeGuid],
                            playing: true
                        }
                    }
                };
            }
            else {
                return {
                    ...state,
                    currentEpisodeGuid: newCurrentEpisodeGuid,
                    currentPlaylistIndex: newCurrentPlaylistIndex,
                    episodes: {
                        ...state.episodes,
                        [newCurrentEpisodeGuid]: {
                            ...state.episodes[newCurrentEpisodeGuid],
                            playing: true
                        },
                        [state.currentEpisodeGuid]: {
                            ...state.episodes[state.currentEpisodeGuid],
                            playing: false
                        }
                    }
                };
            }
        }

        if (action.type === 'PAUSE_EPISODE_FROM_PLAYLIST') {
            return {
                ...state,
                episodes: {
                    ...state.episodes,
                    [state.currentEpisodeGuid]: {
                        ...state.episodes[state.currentEpisodeGuid],
                        playing: false
                    }
                }
            };
        }
    
        if (action.type === 'CURRENT_EPISODE_COMPLETED') {
            const nextPlaylistIndex = state.currentPlaylistIndex + 1;
            const nextEpisodeGuid = state.playlist[nextPlaylistIndex];
    
            if (!nextEpisodeGuid) {
                return {
                    ...state,
                    episodes: {
                        ...state.episodes,
                        [state.currentEpisodeGuid]: {
                            ...state.episodes[state.currentEpisodeGuid],
                            finishedListening: true,
                            progress: 0,
                            playing: false
                        }
                    }
                };
            }
    
            return {
                ...state,
                currentEpisodeGuid: nextEpisodeGuid,
                currentPlaylistIndex: nextPlaylistIndex,
                episodes: {
                    ...state.episodes,
                    [state.currentEpisodeGuid]: {
                        ...state.episodes[state.currentEpisodeGuid],
                        finishedListening: true,
                        progress: 0,
                        playing: false
                    },
                    [nextEpisodeGuid]: {
                        ...state.episodes[nextEpisodeGuid],
                        playing: true
                    }
                }
            };
        }
    
        if (action.type === 'UPDATE_CURRENT_EPISODE_PROGRESS') {
            return {
                ...state,
                episodes: {
                    ...state.episodes,
                    [state.currentEpisodeGuid]: {
                        ...state.episodes[state.currentEpisodeGuid],
                        progress: action.progress
                    }
                }
            };
        }
    
        if (action.type === 'CURRENT_EPISODE_PLAYED') {
            return {
                ...state,
                episodes: {
                    ...state.episodes,
                    [state.currentEpisodeGuid]: {
                        ...state.episodes[state.currentEpisodeGuid],
                        playing: true,
                        timestamps: [...state.episodes[state.currentEpisodeGuid].timestamps, {
                            type: 'START',
                            actionType: 'CURRENT_EPISODE_PLAYED',
                            timestamp: new Date().toISOString()
                        }]
                    }
                }
            };
        }
    
        if (action.type === 'CURRENT_EPISODE_PAUSED') {
            return {
                ...state,
                episodes: {
                    ...state.episodes,
                    [state.currentEpisodeGuid]: {
                        ...state.episodes[state.currentEpisodeGuid],
                        playing: false,
                        timestamps: [...state.episodes[state.currentEpisodeGuid].timestamps, {
                            type: 'STOP',
                            actionType: 'CURRENT_EPISODE_PAUSED',
                            timestamp: new Date().toISOString()
                        }]
                    }
                }
            };
        }
    
        if (action.type === 'REMOVE_EPISODE_FROM_PLAYLIST') {
            return {
                ...state,
                currentPlaylistIndex: state.currentPlaylistIndex > action.playlistIndex ? state.currentPlaylistIndex - 1 : state.currentPlaylistIndex,
                playlist: state.playlist.filter((episodeGuid: string, index: number) => {
                    return action.playlistIndex !== index;
                })
            };
        }
    
        if (action.type === 'MOVE_EPISODE_UP') {
            return {
                ...state,
                currentPlaylistIndex: getCurrentPlaylistIndexAfterMoveUp(state, action),
                playlist: state.playlist.map((episodeGuid: string, index: number) => {
                    if (action.playlistIndex === 0) {
                        return episodeGuid;
                    }
    
                    if (index === action.playlistIndex - 1) {
                        return state.playlist[action.playlistIndex];
                    }
            
                    if (index === action.playlistIndex) {
                        return state.playlist[action.playlistIndex - 1];
                    }
    
                    return episodeGuid;
                })
            };
        }
    
        if (action.type === 'MOVE_EPISODE_DOWN') {
            return {
                ...state,
                currentPlaylistIndex: getCurrentPlaylistIndexAfterMoveDown(state, action),
                playlist: state.playlist.map((episodeGuid: string, index: number) => {
                    if (action.playlistIndex === state.playlist.length - 1) {
                        return episodeGuid;
                    }
    
                    if (index === action.playlistIndex + 1) {
                        return state.playlist[action.playlistIndex];
                    }
            
                    if (index === action.playlistIndex) {
                        return state.playlist[action.playlistIndex + 1];
                    }
    
                    return episodeGuid;
                })
            };
        }
    
        return state;
    }

    const Store = createStore((state, action) => {

        if (action.type !== 'UPDATE_CURRENT_EPISODE_PROGRESS') {
            console.log('action', action);
        }
    
        const newState = RootReducer(state, action);
    
        if (action.type !== 'UPDATE_CURRENT_EPISODE_PROGRESS') {
            console.log('state', newState);
        }
    
        set('state', newState);
    
        return newState;
    });

    return Store;
}

function getCurrentPlaylistIndexAfterMoveUp(state, action) {

    if (
        action.playlistIndex === state.currentPlaylistIndex &&
        action.playlistIndex !== 0
    ) {
        return state.currentPlaylistIndex - 1;
    }

    if (
        action.playlistIndex === state.currentPlaylistIndex + 1
    ) {
        return state.currentPlaylistIndex + 1;
    }

    return state.currentPlaylistIndex;
}

function getCurrentPlaylistIndexAfterMoveDown(state, action) {

    if (
        action.playlistIndex === state.currentPlaylistIndex &&
        action.playlistIndex !== state.playlist.length - 1
    ) {
        return state.currentPlaylistIndex + 1;
    }

    if (
        action.playlistIndex === state.currentPlaylistIndex - 1
    ) {
        return state.currentPlaylistIndex - 1;
    }

    return state.currentPlaylistIndex;
}