import { STORAGE_KEYS } from "../state.js";
import { 
    startStravaLogin, 
    clearTokenStorage,
    getCredentials
} from "../auth.js";
import { clearCachedDatabase } from "../db.js";

function getByIds(...ids) {
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el) return el;
    }
    return null;
}

export const AuthController = {
    init(onSuccess) {
        this.onSuccess = onSuccess;
        this.bindEvents();
    },

    bindEvents() {
        getByIds("save-config", "save-settings-btn")?.addEventListener("click", () => {
            const clientId = document.getElementById("client-id")?.value.trim() || "";
            const clientSecret = document.getElementById("client-secret")?.value.trim() || "";
            localStorage.setItem(STORAGE_KEYS.clientId, clientId);
            localStorage.setItem(STORAGE_KEYS.clientSecret, clientSecret);
            if (this.onSuccess) this.onSuccess();
        });

        document.getElementById("login-btn")?.addEventListener("click", () => {
            const result = startStravaLogin();
            if (result === "SETUP_REQUIRED") this.showSetupState();
        });

        document.getElementById("logout-btn")?.addEventListener("click", () => {
            if (confirm("確定要登出並清除所有本機快取資料嗎？")) {
                clearTokenStorage();
                clearCachedDatabase().then(() => window.location.reload());
            }
        });
    },

    showSetupState() {
        getByIds("setup-view", "setup-section")?.classList.remove("hidden");
        getByIds("auth-view", "auth-section")?.classList.add("hidden");
        getByIds("dashboard-view", "dashboard")?.classList.add("hidden");
    },

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

    showDashboardState() {
        getByIds("setup-view", "setup-section")?.classList.add("hidden");
        getByIds("auth-view", "auth-section")?.classList.add("hidden");
        getByIds("dashboard-view", "dashboard")?.classList.remove("hidden");
    }
};
