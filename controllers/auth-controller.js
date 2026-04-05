import { STORAGE_KEYS } from "../state.js";
import { 
    startStravaLogin, 
    clearTokenStorage,
    getCredentials
} from "../auth.js";
import { clearCachedDatabase } from "../db.js";
import { setStatus } from "../ui-utils.js";

/**
 * Resolve the first existing element by trying multiple ids.
 *
 * @param {...string} ids - Candidate element ids in lookup priority order.
 * @returns {HTMLElement | null} The first matched element, or null when none exists.
 * @throws {TypeError} Throws when a provided id is not a string.
 */
function getByIds(...ids) {
    for (const id of ids) {
        if (typeof id !== "string") {
            throw new TypeError("Element id must be a string.");
        }
        const el = document.getElementById(id);
        if (el) return el;
    }
    return null;
}

/**
 * Clear local auth/cache state and hard-reload the current page.
 *
 * @returns {Promise<void>} A promise that resolves after cache clear and reload are triggered.
 * @throws {Error} Throws when cache clear fails unexpectedly.
 */
async function performLogout() {
    clearTokenStorage();
    await clearCachedDatabase();
    window.location.reload();
}

/**
 * Bind a resilient activation handler for both click and touch interfaces.
 *
 * @param {HTMLElement | null} element - Target interactive element.
 * @param {() => void | Promise<void>} action - Callback executed when the element is activated.
 * @returns {void} No return value.
 * @throws {TypeError} Throws when action is not a function.
 */
function bindButtonActivation(element, action) {
    if (!element) return;
    if (typeof action !== "function") {
        throw new TypeError("action must be a function.");
    }

    let touchHandled = false;

    element.addEventListener("touchend", (event) => {
        event.preventDefault();
        touchHandled = true;
        Promise.resolve(action()).catch((error) => {
            console.error("Button activation failed on touch:", error);
        });
    }, { passive: false });

    element.addEventListener("click", () => {
        if (touchHandled) {
            touchHandled = false;
            return;
        }
        Promise.resolve(action()).catch((error) => {
            console.error("Button activation failed on click:", error);
        });
    });
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
