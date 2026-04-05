import { STORAGE_KEYS } from "../state.js";
import { 
    startStravaLogin, 
    clearTokenStorage,
    getCredentials
} from "../auth.js";
import { clearCachedDatabase } from "../db.js";
import { setStatus, getByIds, bindButtonActivation } from "../ui-utils.js";

/**
 * Clear local auth/cache state and hard-reload the current page.
 * Uses a 3-second timeout so an IndexedDB hang never blocks the reload.
 *
 * @returns {Promise<void>} A promise that resolves after cache clear and reload are triggered.
 */
async function performLogout() {
    clearTokenStorage();
    try {
        await Promise.race([
            clearCachedDatabase(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000))
        ]);
    } catch (e) {
        console.warn("Cache clear failed or timed out, proceeding with logout:", e);
    }
    window.location.reload();
}

export const AuthController = {
    /**
     * Initialize auth controller and bind all auth related events.
     *
     * @param {Function} onSuccess - Callback invoked after local setup is saved successfully.
     * @returns {void} No return value.
     * @throws {TypeError} Throws when onSuccess is provided but is not a function.
     */
    init(onSuccess) {
        if (onSuccess && typeof onSuccess !== "function") {
            throw new TypeError("onSuccess must be a function.");
        }
        this.onSuccess = onSuccess;
        this.bindEvents();
    },

    /**
     * Attach click handlers for setup, login and logout actions.
     *
     * @returns {void} No return value.
     * @throws {Error} Throws when the logout flow fails unexpectedly.
     */
    bindEvents() {
        bindButtonActivation(getByIds("save-config", "save-settings-btn"), () => {
            const clientId = document.getElementById("client-id")?.value.trim() || "";
            const clientSecret = document.getElementById("client-secret")?.value.trim() || "";
            localStorage.setItem(STORAGE_KEYS.clientId, clientId);
            localStorage.setItem(STORAGE_KEYS.clientSecret, clientSecret);
            if (this.onSuccess) this.onSuccess();
        });

        bindButtonActivation(document.getElementById("login-btn"), () => {
            const result = startStravaLogin();
            if (result === "SETUP_REQUIRED") this.showSetupState();
        });

        const logoutBtn = document.getElementById("logout-btn");
        if (logoutBtn) {
            logoutBtn.disabled = false;
            logoutBtn.style.pointerEvents = "auto";
            bindButtonActivation(logoutBtn, async () => {
                setStatus("正在登出並清除本機快取...", "info");
                try {
                    await performLogout();
                } catch (err) {
                    console.error("Logout failed:", err);
                    setStatus("登出失敗，請稍後再試。", "error");
                }
            });
        }
    },

    /**
     * Show setup section and hide auth/dashboard sections.
     *
     * @returns {void} No return value.
     * @throws {Error} Throws if DOM updates fail unexpectedly.
     */
    showSetupState() {
        getByIds("setup-view", "setup-section")?.classList.remove("hidden");
        getByIds("auth-view", "auth-section")?.classList.add("hidden");
        getByIds("dashboard-view", "dashboard")?.classList.add("hidden");
    },

    /**
     * Show auth section and preload stored API credentials.
     *
     * @returns {void} No return value.
     * @throws {Error} Throws if credential hydration fails unexpectedly.
     */
    showAuthState() {
        getByIds("setup-view", "setup-section")?.classList.add("hidden");
        getByIds("auth-view", "auth-section")?.classList.remove("hidden");
        getByIds("dashboard-view", "dashboard")?.classList.add("hidden");
        
        const { clientId } = getCredentials();
        const clientIdInput = document.getElementById("client-id");
        const clientSecretInput = document.getElementById("client-secret");
        
        if (clientIdInput) clientIdInput.value = clientId;
        if (clientSecretInput) clientSecretInput.value = localStorage.getItem(STORAGE_KEYS.clientSecret) || "";
    },

    /**
     * Show dashboard section and hide setup/auth sections.
     *
     * @returns {void} No return value.
     * @throws {Error} Throws if DOM updates fail unexpectedly.
     */
    showDashboardState() {
        getByIds("setup-view", "setup-section")?.classList.add("hidden");
        getByIds("auth-view", "auth-section")?.classList.add("hidden");
        getByIds("dashboard-view", "dashboard")?.classList.remove("hidden");
    }
};
