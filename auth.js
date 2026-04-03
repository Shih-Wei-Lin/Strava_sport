import { STORAGE_KEYS } from "./state.js";
import { setStatus } from "./ui-utils.js";

/**
 * Clear token and session metadata from localStorage.
 */
export function clearTokenStorage() {
    localStorage.removeItem(STORAGE_KEYS.accessToken);
    localStorage.removeItem(STORAGE_KEYS.refreshToken);
    localStorage.removeItem(STORAGE_KEYS.expiresAt);
    localStorage.removeItem(STORAGE_KEYS.athleteName);
    localStorage.removeItem(STORAGE_KEYS.authState);
}

/**
 * Save token payload and athlete metadata to localStorage.
 * @param {object} payload - The Strava token response object.
 */
export function saveTokenData(payload) {
    localStorage.setItem(STORAGE_KEYS.accessToken, payload.access_token);
    localStorage.setItem(STORAGE_KEYS.refreshToken, payload.refresh_token);
    localStorage.setItem(STORAGE_KEYS.expiresAt, String(payload.expires_at));

    if (payload.athlete?.firstname) {
        const athleteName = `${payload.athlete.firstname}${payload.athlete.lastname ? ` ${payload.athlete.lastname}` : ""}`;
        localStorage.setItem(STORAGE_KEYS.athleteName, athleteName);
    }
}

/**
 * Retrieve saved API credentials from localStorage.
 * @returns {{clientId: string, clientSecret: string}}
 */
export function getCredentials() {
    return {
        clientId: localStorage.getItem(STORAGE_KEYS.clientId) || "",
        clientSecret: localStorage.getItem(STORAGE_KEYS.clientSecret) || "",
    };
}

/**
 * Retrieve saved token data from localStorage.
 * @returns {{accessToken: string, refreshToken: string, expiresAt: number}}
 */
export function getTokenData() {
    return {
        accessToken: localStorage.getItem(STORAGE_KEYS.accessToken) || "",
        refreshToken: localStorage.getItem(STORAGE_KEYS.refreshToken) || "",
        expiresAt: Number(localStorage.getItem(STORAGE_KEYS.expiresAt) || 0),
    };
}

/**
 * Build the redirect URI for the current environment.
 * @returns {string}
 */
export function buildRedirectUri() {
    return new URL(window.location.pathname, window.location.origin).toString();
}

/**
 * Initiate the Strava OAuth authorization flow.
 */
export function startStravaLogin() {
    if (window.location.protocol === "file:") {
        setStatus("請用 Live Server 或 `python -m http.server` 啟動，OAuth 無法在 file:// 模式完成。", "error");
        return;
    }

    const { clientId } = getCredentials();
    if (!clientId) {
        // This will be handled by the main app to show setup state
        return "SETUP_REQUIRED";
    }

    const stateValue = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(STORAGE_KEYS.authState, stateValue);

    const loginUrl = new URL("https://www.strava.com/oauth/authorize");
    loginUrl.searchParams.set("client_id", clientId);
    loginUrl.searchParams.set("redirect_uri", buildRedirectUri());
    loginUrl.searchParams.set("response_type", "code");
    loginUrl.searchParams.set("approval_prompt", "auto");
    loginUrl.searchParams.set("scope", "read,activity:read_all,profile:read_all");
    loginUrl.searchParams.set("state", stateValue);

    window.location.href = loginUrl.toString();
}

/**
 * Exchange an authorization code for an access token.
 * @param {string} code - Authorization code from Strava.
 * @param {string} incomingState - State parameter from Strava.
 */
export async function exchangeCodeForToken(code, incomingState) {
    const expectedState = localStorage.getItem(STORAGE_KEYS.authState);
    if (expectedState && incomingState && expectedState !== incomingState) {
        throw new Error("OAuth state 不一致，已中止授權流程。");
    }

    const { clientId, clientSecret } = getCredentials();
    if (!clientId || !clientSecret) {
        throw new Error("缺少 Strava API 設定，無法交換 access token。");
    }

    const payload = await requestToken({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
    });

    saveTokenData(payload);
    localStorage.removeItem(STORAGE_KEYS.authState);
    setStatus("Strava 授權完成，正在載入跑步資料。", "success");
}

/**
 * Ensure the current access token is valid, refreshing it if necessary.
 * @returns {Promise<string|null>} - Valid access token or null if unavailable.
 */
export async function ensureValidToken() {
    const tokenData = getTokenData();
    if (!tokenData.accessToken) {
        return null;
    }

    const now = Math.floor(Date.now() / 1000);
    // Refresh if expiring in less than 2 minutes
    if (tokenData.expiresAt && tokenData.expiresAt - 120 > now) {
        return tokenData.accessToken;
    }

    if (!tokenData.refreshToken) {
        clearTokenStorage();
        return null;
    }

    try {
        const { clientId, clientSecret } = getCredentials();
        const payload = await requestToken({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "refresh_token",
            refresh_token: tokenData.refreshToken,
        });

        saveTokenData(payload);
        return payload.access_token;
    } catch (error) {
        clearTokenStorage();
        setStatus(`刷新 Strava token 失敗：${error.message}`, "error");
        return null;
    }
}

/**
 * Perform an OAuth token request (exchange or refresh).
 * @param {object} params - Key-value pairs for the request body.
 * @returns {Promise<object>}
 */
async function requestToken(params) {
    const response = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(params),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.message || "Strava token API 回應失敗。");
    }

    return payload;
}
