/**
 * Update the status banner with a message and visual variant.
 * @param {string} message - Message to display.
 * @param {string} variant - One of 'info', 'success', 'error'.
 */
export function setStatus(message, variant = "info") {
    const banner = document.getElementById("status-banner");
    if (!banner) return;
    banner.textContent = message;
    banner.className = `status-banner status-${variant}`;
}

/**
 * Remove any current status message and hide the banner.
 */
export function clearStatus() {
    const banner = document.getElementById("status-banner");
    if (!banner) return;
    banner.textContent = "";
    banner.className = "status-banner hidden";
}

/**
 * Resolve the first existing DOM element by checking a list of candidate ids.
 *
 * @param {...string} ids - Candidate element ids in lookup priority order.
 * @returns {HTMLElement|null} The first matched element, or null when none exist.
 */
export function getByIds(...ids) {
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el) return el;
    }
    return null;
}

/**
 * Bind an activation handler that works reliably on both desktop and touch devices.
 *
 * Uses a single "click" listener which is universally supported across all
 * platforms. Previous pointerup + click dedup logic caused silent failures
 * on mobile touch devices where event.button could be inconsistent.
 *
 * @param {HTMLElement|null} element - Target interactive element.
 * @param {() => void | Promise<void>} action - Callback executed on activation.
 */
export function bindButtonActivation(element, action) {
    if (!element) return;
    if (typeof action !== "function") {
        throw new TypeError("action must be a function.");
    }

    element.addEventListener("click", () => {
        Promise.resolve(action()).catch((error) => {
            console.error("Button activation failed:", error);
        });
    });
}

/**
 * Clean up Strava OAuth parameters from the current URL.
 */
export function stripAuthParams() {
    const url = new URL(window.location.href);
    url.searchParams.delete("code");
    url.searchParams.delete("scope");
    url.searchParams.delete("state");
    url.searchParams.delete("error");
    window.history.replaceState({}, document.title, url.toString());
}
