import { customElement, html } from 'functional-element';
import { pcContainerStyles } from '../services/css';
import { Store } from '../services/store';

customElement('pc-wallet', ({ constructing, update }) => {
    if (constructing) {
        Store.subscribe(update);
    }

    return html`
        <style>
            .pc-wallet-container {
                ${pcContainerStyles}
            }

            .pc-wallet-podcast-item {
                padding: 5%;
            }
        </style>

        <div class="pc-wallet-container">
            <h3>
                Payout amount: ~$${Store.getState().payoutAmountDollars}
            </h3>

            <h3>
                Payout interval: 30 days
            </h3>

            <h4>Podcasts</h4>

            ${Object.values(Store.getState().podcasts).map((podcast) => {
                return html`
                    <div class="pc-wallet-podcast-item">
                        <div>${podcast.title}</div>
                        <br>
                        <div>Time listened: ${Math.floor(calculateTotalTimeForPodcast(Store.getState(), podcast) / 1000)} seconds</div>
                        <br>
                        <div>Percentage of total time listened: ${Math.floor(calculatePercentageOfTotalTimeForPodcast(Store.getState(), podcast) * 100)}%</div>
                        <br>
                        <div>Payout: $${calculatePayoutAmountForPodcast(Store.getState(), podcast).toFixed(2)}</div>
                    </div>

                    <hr>
                `;
            })}
        </div>
    `;
})

function calculatePayoutAmountForPodcast(state, podcast) {
    const percentageOfTotalTimeForPodcast = calculatePercentageOfTotalTimeForPodcast(state, podcast);
    return state.payoutAmountDollars * percentageOfTotalTimeForPodcast;
}

function calculatePercentageOfTotalTimeForPodcast(state, podcast) {
    const totalTime = calculateTotalTime(state);
    const totalTimeForPodcast = calculateTotalTimeForPodcast(state, podcast);

    return totalTimeForPodcast / totalTime;
}

function calculateTotalTime(state) {
    return Object.values(state.podcasts).reduce((result, podcast) => {
        return result + calculateTotalTimeForPodcast(state, podcast);
    }, 0);
}

function calculateTotalTimeForPodcast(state, podcast) {
    return podcast.episodes.reduce((result, episodeGuid) => {
        const episode = state.episodes[episodeGuid];

        return result + episode.timestamps.reduce((result, timestamp, index) => {
            const nextTimestamp = episode.timestamps[index + 1];

            if (timestamp.type === 'START') {
                if (nextTimestamp && nextTimestamp.type === 'STOP') {
                    return result - new Date(timestamp.timestamp).getTime();
                }
                else {
                    return result + 0;
                }
            }
            else {
                return result + new Date(timestamp.timestamp).getTime();
            }
        }, 0);
    }, 0);
}