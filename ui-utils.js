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
 * Set the interactive state of primary dashboard buttons.
 * @param {boolean} isReady - True if buttons should be enabled.
 */
export function setActionState(isReady) {
    const refreshBtn = document.getElementById("refresh-data-btn");
    const logoutBtn = document.getElementById("logout-btn");
    if (refreshBtn) refreshBtn.disabled = !isReady;
    if (logoutBtn) logoutBtn.disabled = !isReady;
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
