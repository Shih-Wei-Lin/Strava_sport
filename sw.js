const CACHE_NAME = "stride-scope-v2";
const ASSETS_TO_CACHE = [
    "./",
    "./index.html",
    "./app.js",
    "./analytics.js",
    "./style.css",
    "./manifest.json",
    "./icon.svg",
    "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Manrope:wght@600;700;800&display=swap",
    "https://cdn.jsdelivr.net/npm/chart.js"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
});

self.addEventListener("fetch", (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
