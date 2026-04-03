import { ui } from "./state.js";

/**
 * Update the status banner with a message and visual variant.
 * @param {string} message - Message to display.
 * @param {string} variant - One of 'info', 'success', 'error'.
 */
export function setStatus(message, variant = "info") {
    if (!ui.statusBanner) return;
    ui.statusBanner.textContent = message;
    ui.statusBanner.className = `status-banner status-${variant}`;
}

/**
 * Remove any current status message and hide the banner.
 */
export function clearStatus() {
    if (!ui.statusBanner) return;
    ui.statusBanner.textContent = "";
    ui.statusBanner.className = "status-banner hidden";
}

/**
 * Set the interactive state of primary dashboard buttons.
 * @param {boolean} isReady - True if buttons should be enabled.
 */
export function setActionState(isReady) {
    if (ui.refreshDataBtn) ui.refreshDataBtn.disabled = !isReady;
    if (ui.logoutBtn) ui.logoutBtn.disabled = !isReady;
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
