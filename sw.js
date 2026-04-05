const VERSION = "7225529";
const CACHE_NAME = `stride-scope-${VERSION}`;
const CORE_ASSETS = [
    "./",
    "./index.html",
    "./app.js",
    "./analytics.js",
    "./style.css",
    "./manifest.json",
    "./icon.svg",
];

/**
 * Decide whether a request is a same-origin static asset suitable for stale-while-revalidate.
 *
 * Parameters:
 * - request {Request}: Incoming fetch request.
 *
 * Returns:
 * - {boolean}: `true` when request targets cacheable static resources on the same origin.
 *
 * Raises:
 * - None.
 */
function isSameOriginStaticAsset(request) {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return false;
    return /\.(?:js|css|json|svg|png|jpg|jpeg|webp|ico|woff2?)$/i.test(url.pathname);
}

/**
 * Determine whether a request is an HTML navigation that should prefer fresh network content.
 *
 * Parameters:
 * - request {Request}: Incoming fetch request.
 *
 * Returns:
 * - {boolean}: `true` when request is a top-level navigation or HTML request.
 *
 * Raises:
 * - None.
 */
function isNavigationRequest(request) {
    if (request.mode === "navigate") return true;
    const accept = request.headers.get("accept") || "";
    return accept.includes("text/html");
}

/**
 * Handle HTML/navigation requests with network-first behavior and cache fallback.
 *
 * Parameters:
 * - request {Request}: Request to resolve.
 *
 * Returns:
 * - {Promise<Response>}: Fresh network response when available, otherwise cached fallback.
 *
 * Raises:
 * - {Error}: Re-throws when both network and cache fallback are unavailable.
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
 * Serve static assets quickly from cache while refreshing them in the background.
 *
 * Parameters:
 * - request {Request}: Request to resolve.
 *
 * Returns:
 * - {Promise<Response>}: Cached response when available, otherwise network response.
 *
 * Raises:
 * - {Error}: Re-throws when both cache and network are unavailable.
 */
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const networkPromise = fetch(request)
        .then(async (response) => {
            if (response && response.ok) {
                await cache.put(request, response.clone());
            }
            return response;
        })
        .catch(() => null);

    if (cached) {
        return cached;
    }

    const networkResponse = await networkPromise;
    if (networkResponse) return networkResponse;
    throw new Error(`Resource unavailable: ${request.url}`);
}

/**
 * Remove outdated app caches from previous versions.
 *
 * Parameters:
 * - None.
 *
 * Returns:
 * - {Promise<void>}: Resolves after stale caches are removed.
 *
 * Raises:
 * - None.
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
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)),
    );
});

self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
    if (event.data && event.data.type === "GET_VERSION") {
        const port = event.ports ? event.ports[0] : null;
        if (port) {
            port.postMessage({ type: "VERSION", version: VERSION });
        }
    }
});

self.addEventListener("activate", (event) => {
    event.waitUntil(deleteOldCaches());
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;

    if (isNavigationRequest(event.request)) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    if (isSameOriginStaticAsset(event.request)) {
        event.respondWith(staleWhileRevalidate(event.request));
        return;
    }

    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
