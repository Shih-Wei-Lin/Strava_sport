const VERSION = "7225531";
const CACHE_NAME = `stride-scope-${VERSION}`;
const CORE_ASSETS = [
    "./",
    "./index.html",
    "./app.js",
    "./analytics.js",
    "./style.css",
    "./manifest.json",
    "./icon.svg",
    "./state.js",
    "./auth.js",
    "./api.js",
    "./db.js",
    "./ui-utils.js",
    "./export-utils.js",
    "./controllers/auth-controller.js",
    "./controllers/data-controller.js",
    "./controllers/ui-controller.js",
    "./components/calendar.js",
    "./components/charts.js",
    "./components/dashboard.js",
    "./components/pb-gallery.js",
    "./components/runs-list.js",
    "./utils/format.js",
    "./utils/math.js",
    "./models/physio.js",
    "./analytics/segments.js",
    "./analytics/trends.js",
    "./analytics/intervals.js",
    "./analytics/weather.js",
    "./workers/enrichment.js",
];

/**
 * Handle requests with network-first behavior and cache fallback.
 * This ensures that users always get the latest JS modules if online,
 * preventing 'stale module' mismatch errors.
 */
async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            await cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw error;
    }
}

/**
 * Remove outdated app caches from previous versions.
 */
async function deleteOldCaches() {
    const keys = await caches.keys();
    await Promise.all(
        keys
            .filter((key) => key.startsWith("stride-scope-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
    );
}

self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        deleteOldCaches().then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;

    const url = new URL(event.request.url);
    const isSameOrigin = url.origin === self.location.origin;
    const isStatic = /\.(?:js|css|json|svg|png|jpg|jpeg|webp|ico|woff2?)$/i.test(url.pathname);
    const isNav = event.request.mode === "navigate" || (event.request.headers.get("accept") || "").includes("text/html");

    if (isSameOrigin && (isStatic || isNav)) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "GET_VERSION") {
        const port = event.ports ? event.ports[0] : null;
        if (port) {
            port.postMessage({ type: "VERSION", version: VERSION });
        }
    }
});
