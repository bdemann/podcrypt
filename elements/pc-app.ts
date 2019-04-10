// TODO figure out service workers...nothing I am doing is working
// TODO put the service worker back in once we figure out caching, 206, Range header, and playback issues
// This must come first because some dependencies might depend on dependencies imported in index.html,which is cached
if ('serviceWorker' in window.navigator) {
    // window.addEventListener('load', async () => {
    (async () => {
        try {     
            window.navigator.serviceWorker.register('/service-worker.ts');
            console.log('service worker registration successful');
        }
        catch(error) {
            console.log(error);
        }
    })();
    // });
}

import { customElement, html } from 'functional-element';
import { StorePromise } from '../services/store';
import './pc-router';
import './pc-main-menu';
import './pc-player';
import './pc-hamburger';

// TODO I do not like how we have to do this to get the store...top level await would be really nice
StorePromise.then((Store) => {
    customElement('pc-app', async ({ constructing, update }) => {

        if (constructing) {
            Store.subscribe(update);
        }
    
        return html`
            <style>
                .pc-app-top-bar {
                    position: fixed;
                    padding-top: 5%;
                    padding-left: 3%;
                    padding-bottom: 5%;
                    width: 100%;
                    background-color: white;
                    box-shadow: -5px 5px 5px -5px grey;
                    z-index: 1;
                    display: flex;
                    align-items: center;
                    font-size: calc(15px + 1vmin);
                    font-weight: bold;
                }
            </style>
    
            <div class="pc-app-top-bar">
                <pc-hamburger @click=${mainMenuToggle}></pc-hamburger>
                <div style="margin-left: 5%;">Podcrypt Alpha</div>

                <button @click=${() => alert(window.location)} style="border: none; color: white; background-color: white">URL test</button>                

                <div
                    ?hidden=${Store.getState().payoutProblem === 'NO_PROBLEM'}
                    style="margin-left: auto; margin-right: 5%;"
                >
                    <i 
                        class="material-icons"
                        style="font-size: calc(25px + 1vmin); color: red"
                        @click=${() => alert(getPayoutProblemMessage(Store.getState().payoutProblem))}
                    >
                        error_outline
                    </i>  
                </div>
            </div>
    
            <pc-main-menu></pc-main-menu>
            <pc-router></pc-router>
            <pc-player></pc-player>
        `;
    });    

    function mainMenuToggle(e: any) {
        e.stopPropagation();
    
        Store.dispatch({
            type: 'TOGGLE_SHOW_MAIN_MENU'
        });
    }

    function getPayoutProblemMessage(payoutProblem: PayoutProblem) {
        if (payoutProblem === 'BALANCE_0') {
            return `There is a problem with your next payout: You have a balance of 0`;
        }

        if (payoutProblem === 'PAYOUT_TARGET_0') {
            return `There is a problem with your next payout: Your payout target is $0`;
        }

        if (payoutProblem === 'BALANCE_LESS_THAN_PAYOUT_TARGET') {
            return `There is a problem with your next payout: Your balance is less than your payout target`;
        }
    }
});