// TODO zwitterion needs to change to not say window.process, use self.process or something like that

const CACHE_NAME = 'PODCRYPT_CACHE_V7';
const urlsToCache = [
    '/index.html'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
        .open(CACHE_NAME)
        .then((cache) => {
            return cache.addAll(urlsToCache);
        })
    );
});

self.addEventListener('fetch', (event) => {
    console.log(event.request);
    // TODO Figure out why audio requests have a destination of video
    // We do not respond to media requests because service workers don't currently support Range headers or 206 partial content responses
    if (
        event.request.destination !== 'audio' &&
        event.request.destination !== 'video' &&
        !event.request.url.includes('.mp3') &&
        !event.request.url.includes('.m4a')
    ) {
        event.respondWith(
            caches
            .match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
        );
    }
});