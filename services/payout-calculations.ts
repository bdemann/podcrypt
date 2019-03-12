import { 
    Store,
    AnyAction
} from 'redux';
import {
    calculatePayoutAmountForPodcastDuringCurrentIntervalInWEI,
    calculatePayoutAmountForPodcryptDuringCurrentIntervalInWEI
} from './podcast-calculations';
import { loadEthereumAccountBalance } from './balance-calculations';
import { get } from 'idb-keyval';
import { 
    wait,
    getRSSFeed,
    firstProxy
} from './utilities';

export function getNextPayoutDateInMilliseconds(Store: Readonly<Store<Readonly<State>, AnyAction>>): Milliseconds {
    const previousPayoutDateInMilliseconds: Milliseconds | 'NEVER' = Store.getState().previousPayoutDateInMilliseconds;
    const payoutIntervalInDays: Days = Store.getState().payoutIntervalInDays;
    const oneDayInSeconds: Seconds = '86400';
    const oneDayInMilliseconds: Milliseconds = ethers.utils.bigNumberify(oneDayInSeconds).mul(ethers.utils.bigNumberify(1000));
    const payoutIntervalInMilliseconds: Milliseconds = ethers.utils.bigNumberify(oneDayInMilliseconds).mul(ethers.utils.bigNumberify(payoutIntervalInDays));

    if (previousPayoutDateInMilliseconds === 'NEVER') {
        const nextPayoutDate: Date = new Date(new Date().getTime() + payoutIntervalInMilliseconds);
        const nextPayoutDateRoundedToNearestStartOfDay: Date = new Date(nextPayoutDate.getFullYear(), nextPayoutDate.getMonth(), nextPayoutDate.getDate());
        const nextPayoutDateInMilliseconds: Milliseconds = nextPayoutDateRoundedToNearestStartOfDay.getTime().toString();
        return nextPayoutDateInMilliseconds;
    }
    else {
        const nextPayoutDate: Date = new Date(previousPayoutDateInMilliseconds + payoutIntervalInMilliseconds);
        const nextPayoutDateRoundedToNearestStartOfDay: Date = new Date(nextPayoutDate.getFullYear(), nextPayoutDate.getMonth(), nextPayoutDate.getDate());
        const nextPayoutDateInMilliseconds = nextPayoutDateRoundedToNearestStartOfDay.getTime().toString();
        return nextPayoutDateInMilliseconds;   
    }
}

export function parseEthereumAddressFromPodcastDescription(podcastDescription: string): EthereumAddress | 'NOT_FOUND' | 'MALFORMED' {
    try {
        // TODO I took the regex below straight from here: https://www.regextester.com/99711
        // TODO I am not sure if there are any copyright issues with using it, it seems pretty deminimus and obvious to me
        const matchInfo: RegExpMatchArray | null = podcastDescription.match(/0x[a-fA-F0-9]{40}/);
        const ethereumAddressFromPodcastDescription: EthereumAddress = matchInfo !== null ? matchInfo[0] : 'NOT_FOUND';
        
        console.log('ethereumAddressFromPodcastDescription', ethereumAddressFromPodcastDescription);
        
        if (ethereumAddressFromPodcastDescription === 'NOT_FOUND') {
            return 'NOT_FOUND';
        }
        
        const verifiedAddress = ethers.utils.getAddress(ethereumAddressFromPodcastDescription);
        
        console.log('verifiedAddress', verifiedAddress);
        
        return verifiedAddress;        
    }
    catch(error) {
        console.log(error);
        return 'MALFORMED';
    }
}

export function getPayoutTargetInETH(Store: Readonly<Store<Readonly<State>, AnyAction>>): string | 'Loading...' {
    // TODO make sure all decimal places are fixed and that you know what they are to pass into formatUnits
    const payoutTargetInUSDCentsBigNumber: BigNumber = ethers.utils.parseUnits(Store.getState().payoutTargetInUSDCents, 6);
    console.log('payoutTargetInUSDCentsBigNumber', payoutTargetInUSDCentsBigNumber.toString());
    const currentETHPriceInUSDCentsBigNumber: BigNumber = ethers.utils.parseUnits(Store.getState().currentETHPriceInUSDCents, 6);
    console.log('currentETHPriceInUSDCentsBigNumber', currentETHPriceInUSDCentsBigNumber.toString());
    const payoutTargetInETHBigNumber: BigNumber = payoutTargetInUSDCentsBigNumber.div(currentETHPriceInUSDCentsBigNumber);
    console.log('payoutTargetInETHBigNumber', payoutTargetInETHBigNumber.toString());

    return Store.getState().currentETHPriceInUSDCents === 'UNKNOWN' ? 'Loading...' : parseFloat(ethers.utils.formatUnits(payoutTargetInETHBigNumber, 6)).toFixed(2);
}

export async function payout(Store: Readonly<Store<Readonly<State>, AnyAction>>, ethersProvider: any, retryDelayInMilliseconds: Milliseconds): Promise<void> {
        
    // TODO this is not being used for anything
    Store.dispatch({
        type: 'SET_PAYOUT_IN_PROGRESS',
        payoutInProgress: true
    });

    const podcasts: ReadonlyArray<Podcast> = Object.values(Store.getState().podcasts);

    // TODO if there is a failure with one transaction, we want to keep going with the other transactions
    // TODO we want the previous payment sent even if some transactions fail...or do we?
    // TODO we should probably set the previous transaction payment sent field on podcasts in particular?
    for (let i=0; i < podcasts.length; i++) {
        try {
            const podcast: Podcast = podcasts[i];

            const feed = await getRSSFeed(podcast.feedUrl, firstProxy);

            if (!feed) {
                // TODO if this happens, we should somehow notify the user
                // TODO add error states and ui stuff for each podcast so the user knows the state of everything
                continue;
            }

            const podcastEthereumAddress: EthereumAddress | 'NOT_FOUND' | 'MALFORMED' = parseEthereumAddressFromPodcastDescription(feed.description);
        
            Store.dispatch({
                type: 'SET_PODCAST_ETHEREUM_ADDRESS',
                feedUrl: podcast.feedUrl,
                ethereumAddress: podcastEthereumAddress
            });

            if (
                podcastEthereumAddress === 'NOT_FOUND' ||
                podcastEthereumAddress === 'MALFORMED'
            ) {
                continue;
            }

            // const gasPrice = await web3.eth.getGasPrice();
            const gasPriceInWEI: WEI = 10000000000;
            const gasPriceInWEIBigNumber = ethers.utils.bigNumberify(gasPriceInWEI.toString());

            console.log('gasPriceInWEIBigNumber', gasPriceInWEIBigNumber.toString());
    
            const valueInWEI: WEI = calculatePayoutAmountForPodcastDuringCurrentIntervalInWEI(Store.getState(), podcast);
            const valueInWEIBigNumber = ethers.utils.bigNumberify(valueInWEI.toString());
            
            console.log('valueInWEIBigNumber', valueInWEIBigNumber.toString());
            
            const valueLessGasPriceInWEIBigNumber = valueInWEIBigNumber.sub(gasPriceInWEIBigNumber);
            
            console.log('valueLessGasPriceInWEIBigNumber', valueLessGasPriceInWEIBigNumber.toString());
            
            const netValueInWEIBigNumber = valueLessGasPriceInWEIBigNumber.gt(0) ? valueLessGasPriceInWEIBigNumber : 0;
    
            console.log('netValueInWEIBigNumber', netValueInWEIBigNumber.toString());
    
            if (netValueInWEIBigNumber.eq(0)) {
                continue;
            }

            const wallet = new ethers.Wallet(await get('ethereumPrivateKey'), ethersProvider);
            
            console.log('getting transaction count')
            
            const nonce = await ethersProvider.getTransactionCount(wallet.address);
    
            console.log('nonce', nonce);

            const preparedTransaction = {
                to: podcastEthereumAddress,
                gasLimit: 21000,
                gasPrice: gasPriceInWEIBigNumber,
                value: netValueInWEIBigNumber,
                nonce
                // data: web3.utils.asciiToHex('podcrypt') // TODO we might need to increase the gaslimit for this?
            };
    
            console.log('preparedTransaction', preparedTransaction);
    
            console.log('signing and sending transaction');
    
            const transaction = await wallet.sendTransaction(preparedTransaction);
    
            console.log(`transaction ${transaction.hash} sent`);

            // TODO this isn't working for some reason, check these issues out:
            // TODO https://github.com/ethers-io/ethers.js/issues/346
            // TODO https://github.com/ethers-io/ethers.js/issues/451
            // TODO once those issues are resolved, get rid of the wait below
            // const receipt = await ethersProvider.waitForTransaction(transaction.hash);

            // console.log(`Transaction ${receipt.hash} mined`);
    
            Store.dispatch({
                type: 'SET_PODCAST_LATEST_TRANSACTION_HASH',
                feedUrl: podcast.feedUrl,
                latestTransactionHash: transaction.hash
                // latestTransactionHash: receipt.hash
            });
    
            Store.dispatch({
                type: 'SET_PODCAST_PREVIOUS_PAYOUT_DATE_IN_MILLISECONDS',
                feedUrl: podcast.feedUrl,
                previousPayoutDateInMilliseconds: new Date().getTime()
            });

            // TODO I'll just let the retry mechanism kick in to wait long enough to get the nonce
            // await wait(30000);
        }
        catch(error) {
            console.log('podcast payout error', error);
            console.log(`retrying in ${retryDelayInMilliseconds * 2}`);
            await wait(retryDelayInMilliseconds * 2);
            payout(Store, ethersProvider, retryDelayInMilliseconds * 2);
            return;
        }
    }

    try {
        const gasPriceInWEI: WEI = 10000000000;
        const gasPriceInWEIBigNumber = ethers.utils.bigNumberify(gasPriceInWEI.toString());    

        console.log('gasPriceInWEIBigNumber', gasPriceInWEIBigNumber.toString());

        const valueInWEI: WEI = calculatePayoutAmountForPodcryptDuringCurrentIntervalInWEI(Store.getState());
        const valueInWEIBigNumber = ethers.utils.bigNumberify(valueInWEI.toString());

        console.log('valueInWEIBigNumber', valueInWEIBigNumber.toString());
        
        const valueLessGasPriceInWEIBigNumber = valueInWEIBigNumber.sub(gasPriceInWEIBigNumber);
        
        console.log('valueLessGasPriceInWEIBigNumber', valueLessGasPriceInWEIBigNumber.toString());
        
        const netValueInWEIBigNumber = valueLessGasPriceInWEIBigNumber.gt(0) ? valueLessGasPriceInWEIBigNumber : 0;

        console.log('netValueInWEIBigNumber', netValueInWEIBigNumber.toString());

        if (!netValueInWEIBigNumber.eq(0)) {
            const wallet = new ethers.Wallet(await get('ethereumPrivateKey'), ethersProvider);
        
            console.log('getting transaction count')
            
            const nonce = await ethersProvider.getTransactionCount(wallet.address);
    
            console.log('nonce', nonce);
    
            const preparedTransaction = {
                to: Store.getState().podcryptEthereumAddress,
                gasLimit: 21000,
                gasPrice: gasPriceInWEIBigNumber,
                value: netValueInWEIBigNumber,
                nonce
                // data: web3.utils.asciiToHex('podcrypt') // TODO we might need to increase the gaslimit for this?
            };
    
            console.log('preparedTransaction', preparedTransaction);
    
            console.log('signing and sending transaction');
    
            const transaction = await wallet.sendTransaction(preparedTransaction);
    
            console.log(`transaction ${transaction.hash} sent`);
    
            // TODO this isn't working for some reason, check these issues out:
            // TODO https://github.com/ethers-io/ethers.js/issues/346
            // TODO https://github.com/ethers-io/ethers.js/issues/451
            // TODO once those issues are resolved, get rid of the wait below
            // const receipt = await ethersProvider.waitForTransaction(transaction.hash);
    
            // console.log(`Transaction ${receipt.hash} mined`);
    
            Store.dispatch({
                type: 'SET_PODCRYPT_LATEST_TRANSACTION_HASH',
                podcryptLatestTransactionHash: transaction.hash
            });
    
            Store.dispatch({
                type: 'SET_PODCRYPT_PREVIOUS_PAYOUT_DATE_IN_MILLISECONDS',
                podcryptPreviousPayoutDateInMilliseconds: new Date().getTime()
            });
        }
    }
    catch(error) {
        console.log('podcrypt payout error', error);
        console.log(`retrying in ${retryDelayInMilliseconds * 2}`);
        await wait(retryDelayInMilliseconds * 2);
        payout(Store, ethersProvider, retryDelayInMilliseconds * 2);
        return;
    }

    Store.dispatch({
        type: 'SET_PREVIOUS_PAYOUT_DATE_IN_MILLISECONDS',
        previousPayoutDateInMilliseconds: new Date().getTime()
    });

    const nextPayoutDateInMilliseconds: Milliseconds = getNextPayoutDateInMilliseconds(Store);

    Store.dispatch({
        type: 'SET_NEXT_PAYOUT_DATE_IN_MILLISECONDS',
        nextPayoutDateInMilliseconds
    });

    await loadEthereumAccountBalance(Store, ethersProvider);

    // TODO this is not being used for anything
    Store.dispatch({
        type: 'SET_PAYOUT_IN_PROGRESS',
        payoutInProgress: false
    });
}