import { customElement, html } from 'functional-element';
import { StorePromise } from '../services/store';
import { 
    pcContainerStyles,
    pxXSmall,
    pxSmall,
    pxXXLarge,
    pxXXXSmall,
    normalShadow,
    titleTextLarge,
    standardTextContainer,
    color1Full
 } from '../services/css';
import {
    getRSSFeed,
    navigate,
    createPodcast,
    addEpisodeToPlaylist
} from '../services/utilities';
import './pc-loading';

StorePromise.then((Store) => {
    customElement('pc-podcast-overview', ({ constructing, update, props }) => {
    
        if (constructing) {
            Store.subscribe(update);

            return {
                feedUrl: null,
                previousFeedUrl: null,
                loaded: false,
                podcast: null,
                feed: null
            };
        }

        if (props.feedUrl !== props.previousFeedUrl) {
            update({
                ...props,
                previousFeedUrl: props.feedUrl,
                loaded: false
            });
            getFeed(props.feedUrl, props, update);
        }
    
        return html`
            <style>
                .pc-podcast-overview-container {
                    ${pcContainerStyles}
                }

                .pc-podcast-overview-title-container {
                    display: flex;
                }

                .pc-podcast-overview-title-text {
                    ${titleTextLarge}
                    flex: 4;
                }

                .pc-podcast-overview-title-image-container {
                    flex: 1;
                }

                .pc-podcast-overview-title-image {
                    border-radius: ${pxXXXSmall};
                }

                .pc-podcast-overview-podcast-description {
                    ${standardTextContainer}
                }

                .pc-podcast-overview-episode {
                    box-shadow: ${normalShadow};
                    display: flex;
                    padding: ${pxXSmall};
                    margin-top: ${pxXSmall};
                    margin-bottom: ${pxXSmall};
                    border-radius: ${pxXXXSmall};
                    justify-content: center;
                    background-color: white;
                }

                .pc-podcast-overview-episode-title {
                    font-size: ${pxSmall};
                    font-weight: bold;
                    flex: 10;
                }

                .pc-podcast-overview-episode-controls-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    flex: 1;
                }

                .pc-podcast-overview-episode-add-control {
                    font-size: ${pxXXLarge};
                    cursor: pointer;
                    margin-top: auto;
                }

                .pc-playlist-item-audio-control {
                    font-size: ${pxXXLarge};
                    cursor: pointer;
                }

                .pc-podcast-overview-episode-date {
                    font-size: ${pxXSmall};
                    font-weight: bold;
                    color: ${color1Full};
                }
            </style>

            <div class="pc-podcast-overview-container">
                <pc-loading
                    .hidden=${props.loaded}
                    .prefix=${"pc-podcast-overview-"}
                ></pc-loading>

                ${
                    props.podcast === null || props.feed === null ? 
                        html`<div>Failed to load</div>` : 
                        html`
                            <div class="pc-podcast-overview-title-container">
                                <div class="pc-podcast-overview-title-image-container">
                                    <img class="pc-podcast-overview-title-image" src="${props.podcast.imageUrl}" width="60" height="60">
                                </div>
                                <div class="pc-podcast-overview-title-text">
                                    <div>${props.feed.title}</div>
                                    <div>
                                        ${
                                            props.podcast.ethereumAddress === 'NOT_FOUND' ? 
                                                html`<button style="color: red; border: none; padding: 5px; margin: 5px" @click=${() => notVerifiedHelpClick(props.podcast)}>Not verified - click to help</button>` :
                                                props.podcast.ethereumAddress === 'MALFORMED' ?
                                        html`<button style="color: red; border: none; padding: 5px; margin: 5px" @click=${() => notVerifiedHelpClick(props.podcast)}>Not verified - click to help</button>` :
                                                    html`<button style="color: green; border: none; padding: 5px; margin: 5px" @click=${(e: any) => { e.stopPropagation(); alert(`This podcast's Ethereum address: ${props.podcast.ethereumAddress}`)} }>Verified</button>` }
                                    </div>
                                </div>
                            </div>

                            <br>
                        
                            <div class="pc-podcast-overview-podcast-description">${props.feed.description}</div>

                            ${props.feed.items.map((item: any) => {
                                const episode: Readonly<Episode> | undefined = Store.getState().episodes[item.guid];

                                return html`
                                    <div class="pc-podcast-overview-episode">
                                        <div
                                            class="pc-podcast-overview-episode-title"
                                            @click=${() => navigate(Store, `/episode-overview?feedUrl=${props.podcast.feedUrl}&episodeGuid=${item.guid}`)}
                                        >
                                            <div>${item.title}</div>
                                            <br>
                                            <div class="pc-podcast-overview-episode-date">${new Date(item.isoDate).toLocaleDateString()}</div>
                                        </div>

                                        <div class="pc-podcast-overview-episode-controls-container">
                                            ${
                                                episode && episode.playing ? 
                                                html`<i class="material-icons pc-playlist-item-audio-control" @click=${() => pauseEpisode(item.guid)} title="Pause episode">pause</i>` : 
                                                html`<i class="material-icons pc-playlist-item-audio-control" @click=${() => playEpisode(props.podcast, item)} title="Resume episode">play_arrow</i>`
                                            }

                                            <i 
                                                class="material-icons pc-podcast-overview-episode-add-control"
                                                @click=${() => addEpisodeToPlaylist(Store, props.podcast, item)}
                                            >playlist_add
                                            </i>  

                                        </div>

                                    </div>
                                `;
                            })}
                        `
                }
            </div>
        `;
    });
    
    async function getFeed(feedUrl: string, props: any, update: any): Promise<any> {    
        
        if (
            feedUrl === null ||
            feedUrl === undefined
        ) {
            return;
        }

        const feed = await getRSSFeed(feedUrl);
        const podcast: Readonly<Podcast | null> = await createPodcast(feedUrl, feed);

        update({
            ...props,
            loaded: true,
            previousFeedUrl: feedUrl,
            feed,
            podcast
        });
    }
    
    // TODO really this should add to the playlist and start the playlist
    // function playEpisode(item) {
    //     Store.dispatch({
    //         type: 'PLAY_EPISODE',
    //         episode: {
    //             guid: item.guid,
    //             title: item.title,
    //             src: item.enclosure.url,
    //             finishedListening: false,
    //             playing: false,
    //             progress: 0,
    //             isoDate: item.isoDate
    //         }
    //     });
    // }

    function notVerifiedHelpClick(podcast: Readonly<Podcast>) {
        navigate(Store, `/not-verified-help?feedUrl=${podcast.feedUrl}&podcastEmail=${podcast.email}`);
    }

    function playEpisode(podcast: Readonly<Podcast>, item: any) {
        addEpisodeToPlaylist(Store, podcast, item);
       
        const episodeGuid: EpisodeGuid = item.guid;

        // TODO this action type should be changed, same as in the playlist
        Store.dispatch({
            type: 'PLAY_EPISODE_FROM_PLAYLIST',
            episodeGuid
        });
    }

    function pauseEpisode(episodeGuid: EpisodeGuid) {
        // TODO this action type should be changed, same as in the playlist
        Store.dispatch({
            type: 'PAUSE_EPISODE_FROM_PLAYLIST',
            episodeGuid
        });
    }
});