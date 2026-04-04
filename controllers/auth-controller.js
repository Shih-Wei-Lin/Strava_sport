import { STORAGE_KEYS } from "../state.js";
import { 
    startStravaLogin, 
    clearTokenStorage,
    getCredentials
} from "../auth.js";
import { clearCachedDatabase } from "../db.js";

export const AuthController = {
    init(onSuccess) {
        this.onSuccess = onSuccess;
        this.bindEvents();
    },

    bindEvents() {
        document.getElementById("save-config")?.addEventListener("click", () => {
            const clientId = document.getElementById("client-id").value.trim();
            const clientSecret = document.getElementById("client-secret").value.trim();
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
        document.getElementById("setup-view")?.classList.remove("hidden");
        document.getElementById("auth-view")?.classList.add("hidden");
        document.getElementById("dashboard-view")?.classList.add("hidden");
    },

    showAuthState() {
        document.getElementById("setup-view")?.classList.add("hidden");
        document.getElementById("auth-view")?.classList.remove("hidden");
        document.getElementById("dashboard-view")?.classList.add("hidden");
        
        const { clientId } = getCredentials();
        const clientIdInput = document.getElementById("client-id");
        const clientSecretInput = document.getElementById("client-secret");
        
        if (clientIdInput) clientIdInput.value = clientId;
        if (clientSecretInput) clientSecretInput.value = localStorage.getItem(STORAGE_KEYS.clientSecret) || "";
    },

    showDashboardState() {
        document.getElementById("setup-view")?.classList.add("hidden");
        document.getElementById("auth-view")?.classList.add("hidden");
        document.getElementById("dashboard-view")?.classList.remove("hidden");
    }
};
