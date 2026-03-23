import {
    buildAbilityPrediction,
    calculateBestSegmentEffort,
    formatDeltaPace,
    formatDistance,
    formatDuration,
    formatPaceFromSeconds,
    formatPaceFromSpeed,
    mergeBestEffort,
    parseStravaLocalDate,
    summariseActivities,
} from "./analytics.js";

const STORAGE_KEYS = {
    clientId: "strava_client_id",
    clientSecret: "strava_client_secret",
    accessToken: "strava_access_token",
    refreshToken: "strava_refresh_token",
    expiresAt: "strava_expires_at",
    athleteName: "strava_athlete_name",
    authState: "strava_oauth_state",
};

const state = {
    summary: null,
    detailCache: new Map(),
    runCharts: new Map(),
    weeklyChart: null,
    enrichmentRunId: 0,
    runsPage: 1,
};

const RUNS_PER_PAGE = 10;
const APP_DB_NAME = "stride_scope_db";
const APP_DB_VERSION = 1;
const APP_DB_STORES = {
    runs: "run_activities",
    bundles: "run_bundles",
};

const ui = {};

document.addEventListener("DOMContentLoaded", async () => {
    bindUi();
    wireEvents();
    await initApp();
});

function bindUi() {
    ui.statusBanner = document.getElementById("status-banner");
    ui.setupSection = document.getElementById("setup-section");
    ui.authSection = document.getElementById("auth-section");
    ui.dashboard = document.getElementById("dashboard");

    ui.clientIdInput = document.getElementById("client-id");
    ui.clientSecretInput = document.getElementById("client-secret");
    ui.saveSettingsBtn = document.getElementById("save-settings-btn");
    ui.clearSettingsBtn = document.getElementById("clear-settings-btn");
    ui.editSettingsBtn = document.getElementById("edit-settings-btn");

    ui.loginBtn = document.getElementById("login-btn");
    ui.refreshDataBtn = document.getElementById("refresh-data-btn");
    ui.logoutBtn = document.getElementById("logout-btn");

    ui.monthMileage = document.getElementById("month-mileage");
    ui.monthCount = document.getElementById("month-count");
    ui.weekMileage = document.getElementById("week-mileage");
    ui.weekCount = document.getElementById("week-count");
    ui.recentPace = document.getElementById("recent-pace");
    ui.recentPaceNote = document.getElementById("recent-pace-note");
    ui.recentHr = document.getElementById("recent-hr");
    ui.recentHrNote = document.getElementById("recent-hr-note");
    ui.acwrScore = document.getElementById("acwr-score");
    ui.acwrNote = document.getElementById("acwr-note");
    ui.efficiencyScore = document.getElementById("efficiency-score");
    ui.efficiencyNote = document.getElementById("efficiency-note");
    ui.recentCadence = document.getElementById("recent-cadence");
    ui.recentCadenceNote = document.getElementById("recent-cadence-note");
    ui.elevationDensity = document.getElementById("elevation-density");
    ui.elevationDensityNote = document.getElementById("elevation-density-note");
    ui.pb1k = document.getElementById("pb-1k");
    ui.pb1kDate = document.getElementById("pb-1k-date");
    ui.pb3k = document.getElementById("pb-3k");
    ui.pb3kDate = document.getElementById("pb-3k-date");
    ui.pb5k = document.getElementById("pb-5k");
    ui.pb5kDate = document.getElementById("pb-5k-date");
    ui.pb10k = document.getElementById("pb-10k");
    ui.pb10kDate = document.getElementById("pb-10k-date");

    ui.trainingHeadline = document.getElementById("training-headline");
    ui.trainingSummary = document.getElementById("training-summary");
    ui.recentLoad = document.getElementById("recent-load");
    ui.longestRun = document.getElementById("longest-run");
    ui.paceDelta = document.getElementById("pace-delta");
    ui.consistencyScore = document.getElementById("consistency-score");
    ui.avgRunDistance = document.getElementById("avg-run-distance");
    ui.avgRunDuration = document.getElementById("avg-run-duration");
    ui.qualityRunRatio = document.getElementById("quality-run-ratio");
    ui.hrDeltaTrend = document.getElementById("hr-delta-trend");
    ui.longRunShare = document.getElementById("long-run-share");

    ui.abilityModel = document.getElementById("ability-model");
    ui.abilityScore = document.getElementById("ability-score");
    ui.predictionSource = document.getElementById("prediction-source");
    ui.pred5k = document.getElementById("pred-5k");
    ui.pred10k = document.getElementById("pred-10k");
    ui.predHalf = document.getElementById("pred-half");
    ui.predMarathon = document.getElementById("pred-marathon");
    ui.predictionNote = document.getElementById("prediction-note");

    ui.runsCount = document.getElementById("runs-count");
    ui.runsList = document.getElementById("runs-list");
    ui.runsPagination = document.getElementById("runs-pagination");
    ui.runsPrevBtn = document.getElementById("runs-prev-btn");
    ui.runsNextBtn = document.getElementById("runs-next-btn");
    ui.runsPageInfo = document.getElementById("runs-page-info");
    ui.downloadAllJsonBtn = document.getElementById("download-all-json-btn");
    ui.downloadAllMdBtn = document.getElementById("download-all-md-btn");
    ui.weeklyChartCanvas = document.getElementById("weekly-chart");

    ui.openAiBtn = document.getElementById("get-openai-btn");
    ui.geminiBtn = document.getElementById("get-gemini-btn");
    ui.promptContainer = document.getElementById("prompt-container");
    ui.coachPrompt = document.getElementById("coach-prompt");
    ui.copyBtn = document.getElementById("copy-btn");
    ui.copyToast = document.getElementById("copy-toast");

    ui.downloadAllJsonBtn.disabled = true;
    ui.downloadAllMdBtn.disabled = true;
}

function wireEvents() {
    ui.saveSettingsBtn.addEventListener("click", handleSaveSettings);
    ui.clearSettingsBtn.addEventListener("click", handleClearSettings);
    ui.editSettingsBtn.addEventListener("click", () => showSetupState(true));
    ui.loginBtn.addEventListener("click", startStravaLogin);
    ui.refreshDataBtn.addEventListener("click", loadDashboard);
    ui.logoutBtn.addEventListener("click", handleLogout);
    ui.openAiBtn.addEventListener("click", () => generateCoachPrompt("ChatGPT"));
    ui.geminiBtn.addEventListener("click", () => generateCoachPrompt("Gemini"));
    ui.copyBtn.addEventListener("click", handleCopyPrompt);
    ui.runsPrevBtn.addEventListener("click", () => changeRunsPage(-1));
    ui.runsNextBtn.addEventListener("click", () => changeRunsPage(1));
    ui.downloadAllJsonBtn.addEventListener("click", () => downloadAllRuns("json"));
    ui.downloadAllMdBtn.addEventListener("click", () => downloadAllRuns("md"));
}

async function initApp() {
    hydrateSettingsInputs();
    setActionState(false);

    const url = new URL(window.location.href);
    const authError = url.searchParams.get("error");
    const authCode = url.searchParams.get("code");
    const authState = url.searchParams.get("state");

    if (authError) {
        setStatus(`Strava 授權失敗：${authError}`, "error");
        stripAuthParams();
    }

    if (authCode) {
        try {
            setStatus("正在完成 Strava 驗證...", "info");
            await exchangeCodeForToken(authCode, authState);
            stripAuthParams();
        } catch (error) {
            setStatus(error.message, "error");
            stripAuthParams();
        }
    }

    if (!hasSavedCredentials()) {
        showSetupState(false);
        return;
    }

    showAuthState();

    const token = await ensureValidToken();
    if (!token) {
        setStatus("請先連接 Strava 帳號，再載入跑步資料。", "info");
        return;
    }

    await loadDashboard();
}

function hydrateSettingsInputs() {
    ui.clientIdInput.value = localStorage.getItem(STORAGE_KEYS.clientId) || "";
    ui.clientSecretInput.value = localStorage.getItem(STORAGE_KEYS.clientSecret) || "";
}

/**
 * Persist API credentials, clear tokens, and move UI to auth stage.
 *
 * Parameters:
 * - None.
 *
 * Returns:
 * - void: This handler performs side effects only.
 *
 * Raises:
 * - No explicit throw. Invalid input is handled via status messages.
 */
function handleSaveSettings() {
    const clientId = ui.clientIdInput.value.trim();
    const clientSecret = ui.clientSecretInput.value.trim();

    if (!clientId || !clientSecret) {
        setStatus("請完整填入 Strava Client ID 與 Client Secret。", "error");
        return;
    }

    localStorage.setItem(STORAGE_KEYS.clientId, clientId);
    localStorage.setItem(STORAGE_KEYS.clientSecret, clientSecret);
    clearTokenStorage();
    setStatus("API 設定已儲存，接著可以開始 Strava 授權。", "success");
    showAuthState();
}

/**
 * Remove credentials, tokens, and local cache, then reset dashboard state.
 *
 * Parameters:
 * - None.
 *
 * Returns:
 * - void: This handler performs side effects only.
 *
 * Raises:
 * - No explicit throw. Cache cleanup is fire-and-forget.
 */
function handleClearSettings() {
    localStorage.removeItem(STORAGE_KEYS.clientId);
    localStorage.removeItem(STORAGE_KEYS.clientSecret);
    localStorage.removeItem(STORAGE_KEYS.athleteName);
    clearTokenStorage();
    state.detailCache.clear();
    hydrateSettingsInputs();
    state.summary = null;
    renderEmptyDashboard();
    showSetupState(false);
    setStatus("已清除 API 設定與授權資料。", "success");
    void clearCachedDatabase();
}

/**
 * Clear token/session state and reset UI to authentication stage.
 *
 * Parameters:
 * - None.
 *
 * Returns:
 * - void: This handler performs side effects only.
 *
 * Raises:
 * - No explicit throw. Cache cleanup is fire-and-forget.
 */
function handleLogout() {
    clearTokenStorage();
    state.detailCache.clear();
    state.summary = null;
    renderEmptyDashboard();
    showAuthState();
    setStatus("已清除本機授權 token，需要重新連接 Strava。", "success");
    void clearCachedDatabase();
}

function setActionState(isReady) {
    ui.refreshDataBtn.disabled = !isReady;
    ui.logoutBtn.disabled = !isReady;
}

function showSetupState(showStatus) {
    ui.setupSection.classList.remove("hidden");
    ui.authSection.classList.add("hidden");
    ui.dashboard.classList.add("hidden");
    setActionState(false);

    if (showStatus) {
        setStatus("你可以在這裡更新 Strava API 設定。", "info");
    }
}

function showAuthState() {
    ui.setupSection.classList.add("hidden");
    ui.authSection.classList.remove("hidden");
    ui.dashboard.classList.add("hidden");
    setActionState(false);
}

function showDashboardState() {
    ui.setupSection.classList.add("hidden");
    ui.authSection.classList.add("hidden");
    ui.dashboard.classList.remove("hidden");
    setActionState(true);
}

function setStatus(message, variant = "info") {
    ui.statusBanner.textContent = message;
    ui.statusBanner.className = `status-banner status-${variant}`;
}

function clearStatus() {
    ui.statusBanner.textContent = "";
    ui.statusBanner.className = "status-banner hidden";
}

function stripAuthParams() {
    const url = new URL(window.location.href);
    url.searchParams.delete("code");
    url.searchParams.delete("scope");
    url.searchParams.delete("state");
    url.searchParams.delete("error");
    window.history.replaceState({}, document.title, url.toString());
}

function hasSavedCredentials() {
    return Boolean(localStorage.getItem(STORAGE_KEYS.clientId) && localStorage.getItem(STORAGE_KEYS.clientSecret));
}

function getCredentials() {
    return {
        clientId: localStorage.getItem(STORAGE_KEYS.clientId) || "",
        clientSecret: localStorage.getItem(STORAGE_KEYS.clientSecret) || "",
    };
}

function getTokenData() {
    return {
        accessToken: localStorage.getItem(STORAGE_KEYS.accessToken) || "",
        refreshToken: localStorage.getItem(STORAGE_KEYS.refreshToken) || "",
        expiresAt: Number(localStorage.getItem(STORAGE_KEYS.expiresAt) || 0),
    };
}

/**
 * Load cached run activities from IndexedDB.
 *
 * Parameters:
 * - None.
 *
 * Returns:
 * - Promise<Array<object>>: Cached activities array, or an empty array.
 *
 * Raises:
 * - No explicit throw. Errors are swallowed and treated as cache miss.
 */
async function loadCachedRuns() {
    try {
        const record = await readDbRecord(APP_DB_STORES.runs, "all_runs");
        return Array.isArray(record?.activities) ? record.activities : [];
    } catch (error) {
        console.warn("Failed to read cached runs", error);
        return [];
    }
}

/**
 * Persist run activities into IndexedDB.
 *
 * Parameters:
 * - activities (Array<object>): Run activities payload from Strava.
 *
 * Returns:
 * - Promise<void>: Resolves when the cache write finishes.
 *
 * Raises:
 * - No explicit throw. Errors are logged and ignored.
 */
async function saveCachedRuns(activities) {
    try {
        await writeDbRecord(APP_DB_STORES.runs, {
            key: "all_runs",
            savedAt: new Date().toISOString(),
            activities,
        });
    } catch (error) {
        console.warn("Failed to cache runs", error);
    }
}

/**
 * Load a cached run detail bundle by run id.
 *
 * Parameters:
 * - runId (number): Strava activity id.
 *
 * Returns:
 * - Promise<object|null>: Cached detail bundle or null.
 *
 * Raises:
 * - No explicit throw. Errors are swallowed and treated as cache miss.
 */
async function loadCachedRunBundle(runId) {
    try {
        const record = await readDbRecord(APP_DB_STORES.bundles, runId);
        return record?.bundle || null;
    } catch (error) {
        console.warn("Failed to read cached run bundle", runId, error);
        return null;
    }
}

/**
 * Persist one run detail bundle into IndexedDB.
 *
 * Parameters:
 * - runId (number): Strava activity id.
 * - bundle (object): Detail and streams payload.
 *
 * Returns:
 * - Promise<void>: Resolves when the cache write finishes.
 *
 * Raises:
 * - No explicit throw. Errors are logged and ignored.
 */
async function saveCachedRunBundle(runId, bundle) {
    try {
        await writeDbRecord(APP_DB_STORES.bundles, {
            runId,
            savedAt: new Date().toISOString(),
            bundle,
        });
    } catch (error) {
        console.warn("Failed to cache run bundle", runId, error);
    }
}

function clearTokenStorage() {
    localStorage.removeItem(STORAGE_KEYS.accessToken);
    localStorage.removeItem(STORAGE_KEYS.refreshToken);
    localStorage.removeItem(STORAGE_KEYS.expiresAt);
    localStorage.removeItem(STORAGE_KEYS.authState);
}

function saveTokenData(payload) {
    localStorage.setItem(STORAGE_KEYS.accessToken, payload.access_token);
    localStorage.setItem(STORAGE_KEYS.refreshToken, payload.refresh_token);
    localStorage.setItem(STORAGE_KEYS.expiresAt, String(payload.expires_at));

    if (payload.athlete?.firstname) {
        const athleteName = `${payload.athlete.firstname}${payload.athlete.lastname ? ` ${payload.athlete.lastname}` : ""}`;
        localStorage.setItem(STORAGE_KEYS.athleteName, athleteName);
    }
}

function buildRedirectUri() {
    return new URL(window.location.pathname, window.location.origin).toString();
}

function startStravaLogin() {
    if (window.location.protocol === "file:") {
        setStatus("請用 Live Server 或 `python -m http.server` 啟動，OAuth 無法在 file:// 模式完成。", "error");
        return;
    }

    const { clientId } = getCredentials();
    if (!clientId) {
        showSetupState(true);
        return;
    }

    const stateValue = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(STORAGE_KEYS.authState, stateValue);

    const loginUrl = new URL("https://www.strava.com/oauth/authorize");
    loginUrl.searchParams.set("client_id", clientId);
    loginUrl.searchParams.set("redirect_uri", buildRedirectUri());
    loginUrl.searchParams.set("response_type", "code");
    loginUrl.searchParams.set("approval_prompt", "auto");
    loginUrl.searchParams.set("scope", "read,activity:read_all");
    loginUrl.searchParams.set("state", stateValue);

    window.location.href = loginUrl.toString();
}

async function exchangeCodeForToken(code, incomingState) {
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

async function ensureValidToken() {
    const tokenData = getTokenData();
    if (!tokenData.accessToken) {
        return null;
    }

    const now = Math.floor(Date.now() / 1000);
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

async function loadDashboard() {
    const token = await ensureValidToken();
    if (!token) {
        showAuthState();
        return;
    }

    showDashboardState();
    clearStatus();
    renderEmptyDashboard();
    ui.runsList.innerHTML = '<p class="empty-state">正在載入跑步資料...</p>';
    ui.runsCount.textContent = "載入中";

    try {
        const activities = await fetchRunActivities(token);
        state.summary = summariseActivities(activities, new Date());
        renderDashboard(state.summary);

        const athleteName = localStorage.getItem(STORAGE_KEYS.athleteName);
        const prefix = athleteName ? `${athleteName}，` : "";

        if (state.summary.runs.length === 0) {
            setStatus("已連接 Strava，但目前沒有找到跑步活動資料。", "info");
            return;
        }

        setStatus(`${prefix}已載入 ${state.summary.runs.length} 筆跑步活動。`, "success");
        const enrichmentRunId = ++state.enrichmentRunId;
        void enrichPerformanceInsights(enrichmentRunId);
    } catch (error) {
        console.error(error);
        showAuthState();
        setStatus(`載入 Strava 活動失敗：${error.message}`, "error");
    }
}

/**
 * Fetch run activities from Strava with IndexedDB fallback cache.
 *
 * Parameters:
 * - token (string): Valid Strava access token.
 *
 * Returns:
 * - Promise<Array<object>>: Run activities from API or local cache.
 *
 * Raises:
 * - Error: Propagates network/API errors when cache is unavailable.
 */
async function fetchRunActivities(token) {
    const cachedRuns = await loadCachedRuns();
    const activities = [];
    const perPage = 100;

    try {
        for (let page = 1; page <= 4; page += 1) {
            const response = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=${page}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.status === 401) {
                clearTokenStorage();
                throw new Error("Strava access token 已失效，請重新授權。");
            }

            if (!response.ok) {
                throw new Error(`Strava activities API 錯誤 (${response.status})。`);
            }

            const pageData = await response.json();
            if (!Array.isArray(pageData) || pageData.length === 0) {
                break;
            }

            activities.push(...pageData);
            if (pageData.length < perPage) {
                break;
            }
        }

        const filteredRuns = activities.filter((activity) => activity.type === "Run" || activity.sport_type === "Run");
        await saveCachedRuns(filteredRuns);
        return filteredRuns;
    } catch (error) {
        if (cachedRuns.length > 0) {
            setStatus(`Strava API 暫時不可用，改用本機快取資料（${cachedRuns.length} 筆）。`, "info");
            return cachedRuns;
        }

        throw error;
    }
}

function renderDashboard(summary) {
    state.runsPage = 1;
    renderTopStats(summary);
    renderInsight(summary);
    renderPrediction(summary);
    renderWeeklyChart(summary.weeklyTrend);
    renderRuns(summary.runs);
}

function getDisplayBestEffort(summary, target) {
    if (target === "1K") {
        return summary.bests.segment1k || summary.bests.fullRun1k;
    }

    if (target === "3K") {
        return summary.bests.segment3k || summary.bests.fullRun3k;
    }

    if (target === "5K") {
        return summary.bests.segment5k || summary.bests.fullRun5k;
    }

    return summary.bests.segment10k || summary.bests.fullRun10k;
}

function renderTopStats(summary) {
    ui.monthMileage.textContent = formatDistance(summary.totals.monthDistanceKm);
    ui.monthCount.textContent = `${summary.totals.monthCount} 次跑步`;
    ui.weekMileage.textContent = formatDistance(summary.totals.weekDistanceKm);
    ui.weekCount.textContent = `${summary.totals.weekCount} 次跑步`;

    ui.recentPace.textContent = formatPaceFromSeconds(summary.totals.recentAveragePaceSec);
    ui.recentPaceNote.textContent = "最近 4 次活動";
    ui.recentHr.textContent =
        summary.totals.recentAverageHr == null ? "--" : `${Math.round(summary.totals.recentAverageHr)} bpm`;
    ui.recentHrNote.textContent = "最近 4 次活動";
    if (ui.acwrScore && ui.acwrNote) {
        ui.acwrScore.textContent = formatAcwr(summary.totals.acuteChronicRatio);
        ui.acwrNote.textContent = explainAcwr(summary.totals.acuteChronicRatio);
    }

    if (ui.efficiencyScore && ui.efficiencyNote) {
        ui.efficiencyScore.textContent = formatEfficiencyIndex(summary.totals.efficiencyIndex);
        ui.efficiencyNote.textContent = "最近 6 次速度 / 心率";
    }

    if (ui.recentCadence && ui.recentCadenceNote) {
        ui.recentCadence.textContent =
            summary.totals.recentCadence == null ? "--" : `${summary.totals.recentCadence.toFixed(1)} spm`;
        ui.recentCadenceNote.textContent = "最近 6 次活動";
    }

    if (ui.elevationDensity && ui.elevationDensityNote) {
        ui.elevationDensity.textContent =
            summary.totals.elevationPerKm == null ? "--" : `${summary.totals.elevationPerKm.toFixed(1)} m/km`;
        ui.elevationDensityNote.textContent = "最近 6 次平均每公里爬升";
    }

    renderBestEffort(ui.pb1k, ui.pb1kDate, getDisplayBestEffort(summary, "1K"), "尚未找到可用的 1K 區段");
    renderBestEffort(ui.pb3k, ui.pb3kDate, getDisplayBestEffort(summary, "3K"), "尚未找到可用的 3K 區段");
    renderBestEffort(ui.pb5k, ui.pb5kDate, getDisplayBestEffort(summary, "5K"), "尚未找到可用的 5K 區段");
    renderBestEffort(ui.pb10k, ui.pb10kDate, getDisplayBestEffort(summary, "10K"), "尚未找到可用的 10K 區段");
}

/**
 * Format Acute:Chronic Workload Ratio for dashboard display.
 *
 * Parameters:
 * - ratio (number|null): ACWR numeric value.
 *
 * Returns:
 * - string: Formatted ratio text or placeholder.
 *
 * Raises:
 * - No explicit throw. Invalid values return "--".
 */
function formatAcwr(ratio) {
    if (!Number.isFinite(ratio)) {
        return "--";
    }

    return ratio.toFixed(2);
}

/**
 * Explain ACWR zone based on sports-science common guidance ranges.
 *
 * Parameters:
 * - ratio (number|null): ACWR numeric value.
 *
 * Returns:
 * - string: A short interpretation label for the current ratio.
 *
 * Raises:
 * - No explicit throw. Invalid values return fallback guidance.
 */
function explainAcwr(ratio) {
    if (!Number.isFinite(ratio)) {
        return "資料不足";
    }

    if (ratio < 0.8) {
        return "偏低（可逐步加量）";
    }

    if (ratio <= 1.3) {
        return "合理區間";
    }

    return "偏高（注意恢復）";
}

/**
 * Format efficiency index for dashboard display.
 *
 * Parameters:
 * - value (number|null): Efficiency value in scaled speed-heart-rate units.
 *
 * Returns:
 * - string: Display string with 2 decimals or placeholder.
 *
 * Raises:
 * - No explicit throw. Invalid values return "--".
 */
function formatEfficiencyIndex(value) {
    if (!Number.isFinite(value)) {
        return "--";
    }

    return value.toFixed(2);
}

function renderBestEffort(valueNode, subtextNode, effort, emptyText) {
    if (!valueNode || !subtextNode) {
        return;
    }

    if (!effort) {
        valueNode.textContent = "--";
        subtextNode.textContent = emptyText;
        return;
    }

    valueNode.textContent = formatDuration(effort.movingTimeSec);
    const rangeText = effort.source === "segment" ? ` · ${effort.splitRangeLabel}` : "";
    subtextNode.textContent = `${effort.dateLabel}${rangeText} · ${formatPaceFromSeconds(effort.averagePaceSec)}`;
}

function renderInsight(summary) {
    ui.trainingHeadline.textContent = summary.insight.headline;
    ui.trainingSummary.textContent = summary.insight.summary;
    ui.recentLoad.textContent = formatDistance(summary.totals.recentSevenDayDistanceKm);
    ui.longestRun.textContent = formatDistance(summary.totals.longestRunKm);
    ui.paceDelta.textContent = formatDeltaPace(summary.insight.paceDeltaSec);
    ui.consistencyScore.textContent = summary.totals.consistencyScore;
    if (ui.avgRunDistance) {
        ui.avgRunDistance.textContent = formatDistance(summary.totals.averageRunDistanceKm);
    }
    if (ui.avgRunDuration) {
        ui.avgRunDuration.textContent =
            summary.totals.averageRunDurationSec == null ? "--" : formatDuration(summary.totals.averageRunDurationSec);
    }
    if (ui.qualityRunRatio) {
        ui.qualityRunRatio.textContent = formatPercentage(summary.totals.qualityRunRatio);
    }
    if (ui.hrDeltaTrend) {
        ui.hrDeltaTrend.textContent = formatHrDelta(summary.totals.hrDeltaBpm);
    }
    if (ui.longRunShare) {
        ui.longRunShare.textContent = formatPercentage(summary.totals.longRunSharePercent);
    }
}

/**
 * Format a ratio-like value as percentage text.
 *
 * Parameters:
 * - value (number|null): Percentage numeric value.
 *
 * Returns:
 * - string: Formatted percentage or placeholder.
 *
 * Raises:
 * - No explicit throw. Invalid values return "--".
 */
function formatPercentage(value) {
    if (!Number.isFinite(value)) {
        return "--";
    }

    return `${value.toFixed(1)}%`;
}

/**
 * Format heart-rate delta trend between recent and previous training blocks.
 *
 * Parameters:
 * - value (number|null): Heart-rate delta in bpm.
 *
 * Returns:
 * - string: Signed bpm trend label.
 *
 * Raises:
 * - No explicit throw. Invalid values return placeholder text.
 */
function formatHrDelta(value) {
    if (!Number.isFinite(value)) {
        return "--";
    }

    if (Math.abs(value) < 0.5) {
        return "持平";
    }

    const direction = value > 0 ? "↑" : "↓";
    return `${direction} ${Math.abs(value).toFixed(1)} bpm`;
}

function renderPrediction(summary) {
    const prediction = summary.prediction;
    if (!prediction) {
        ui.abilityModel.textContent = "VDOT";
        ui.abilityScore.textContent = "--";
        ui.predictionSource.textContent = "需要至少一筆 3K 以上的有效跑步資料";
        ui.pred5k.textContent = "--";
        ui.pred10k.textContent = "--";
        ui.predHalf.textContent = "--";
        ui.predMarathon.textContent = "--";
        ui.predictionNote.textContent = "目前資料不足，還無法估計等效成績。";
        return;
    }

    ui.abilityModel.textContent = prediction.model;
    ui.abilityScore.textContent = prediction.vdot.toFixed(1);

    const anchor = prediction.anchor;
    const sourceKind = anchor.source === "segment" ? `連續區段 ${anchor.splitRangeLabel}` : "整筆活動";
    ui.predictionSource.textContent = `${anchor.dateLabel} · ${anchor.name} · ${sourceKind}`;
    ui.pred5k.textContent = prediction.predictions["5K"].vdotTimeLabel;
    ui.pred10k.textContent = prediction.predictions["10K"].vdotTimeLabel;
    ui.predHalf.textContent = prediction.predictions.Half.vdotTimeLabel;
    ui.predMarathon.textContent = prediction.predictions.Marathon.vdotTimeLabel;
    ui.predictionNote.textContent = `${prediction.caution} Riegel 全馬外推約 ${prediction.predictions.Marathon.riegelTimeLabel}。`;
}

async function enrichPerformanceInsights(enrichmentRunId) {
    if (!state.summary) {
        return;
    }

    const candidateRuns = state.summary.runs
        .filter((run) => run.distanceKm >= 1 && run.startedAt >= new Date(Date.now() - 180 * 24 * 60 * 60 * 1000))
        .slice(0, 40);

    if (candidateRuns.length === 0) {
        return;
    }

    setStatus(
        `已載入 ${state.summary.runs.length} 筆活動，正在分析最近 ${candidateRuns.length} 筆活動的連續 1K / 3K / 5K / 10K 區段...`,
        "info",
    );

    const batchSize = 4;

    for (let start = 0; start < candidateRuns.length; start += batchSize) {
        if (enrichmentRunId !== state.enrichmentRunId) {
            return;
        }

        const batch = candidateRuns.slice(start, start + batchSize);
        const bundles = await Promise.all(
            batch.map(async (run) => {
                try {
                    if (state.detailCache.has(run.id)) {
                        return { run, bundle: state.detailCache.get(run.id) };
                    }

                    const bundle = await fetchRunDetailBundle(run.id);
                    state.detailCache.set(run.id, bundle);
                    return { run, bundle };
                } catch (error) {
                    console.warn("Failed to enrich run details", run.id, error);
                    return { run, bundle: null };
                }
            }),
        );

        bundles.forEach(({ run, bundle }) => {
            const splits = bundle?.detail?.splits_metric;
            if (!Array.isArray(splits) || splits.length === 0) {
                return;
            }

            const segment5k = calculateBestSegmentEffort(run, splits, 5);
            const segment10k = calculateBestSegmentEffort(run, splits, 10);
            const segment1k = calculateBestSegmentEffort(run, splits, 1);
            const segment3k = calculateBestSegmentEffort(run, splits, 3);
            state.summary.bests.segment1k = mergeBestEffort(state.summary.bests.segment1k, segment1k);
            state.summary.bests.segment3k = mergeBestEffort(state.summary.bests.segment3k, segment3k);
            state.summary.bests.segment5k = mergeBestEffort(state.summary.bests.segment5k, segment5k);
            state.summary.bests.segment10k = mergeBestEffort(state.summary.bests.segment10k, segment10k);
        });

        state.summary.prediction = recomputePrediction(state.summary);
        renderTopStats(state.summary);
        renderPrediction(state.summary);
    }

    if (enrichmentRunId === state.enrichmentRunId) {
        setStatus("已完成連續 1K / 3K / 5K / 10K 區段分析，成績預測已更新。", "success");
    }
}

function recomputePrediction(summary) {
    const recentFullEfforts = summary.runs
        .filter((run) => run.startedAt >= new Date(Date.now() - 180 * 24 * 60 * 60 * 1000))
        .filter((run) => run.distanceKm >= 3 && run.distanceKm <= 21.1)
        .slice(0, 16);

    return buildAbilityPrediction([
        summary.bests.segment5k,
        summary.bests.segment10k,
        summary.bests.segment3k,
        summary.bests.fullRun3k,
        summary.bests.fullRun5k,
        summary.bests.fullRun10k,
        ...recentFullEfforts,
    ]);
}

function renderWeeklyChart(weeklyTrend) {
    if (!window.Chart || !ui.weeklyChartCanvas) {
        return;
    }

    if (state.weeklyChart) {
        state.weeklyChart.destroy();
    }

    state.weeklyChart = new window.Chart(ui.weeklyChartCanvas, {
        type: "bar",
        data: {
            labels: weeklyTrend.map((entry) => entry.label),
            datasets: [
                {
                    label: "跑量 (km)",
                    data: weeklyTrend.map((entry) => entry.distanceKm),
                    borderRadius: 14,
                    backgroundColor: [
                        "rgba(94, 234, 212, 0.28)",
                        "rgba(94, 234, 212, 0.32)",
                        "rgba(94, 234, 212, 0.38)",
                        "rgba(94, 234, 212, 0.45)",
                        "rgba(249, 115, 22, 0.42)",
                        "rgba(249, 115, 22, 0.55)",
                    ],
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: "#edf6f3" },
                },
                tooltip: {
                    callbacks: {
                        afterLabel(context) {
                            const trendEntry = weeklyTrend[context.dataIndex];
                            return `跑步次數: ${trendEntry.runCount}`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    ticks: { color: "#99aebe" },
                    grid: { display: false },
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: "#99aebe" },
                    grid: { color: "rgba(153, 174, 190, 0.12)" },
                },
            },
        },
    });
}

function renderRuns(runs) {
    const totalPages = Math.max(1, Math.ceil(runs.length / RUNS_PER_PAGE));
    if (state.runsPage > totalPages) {
        state.runsPage = totalPages;
    }

    ui.runsCount.textContent = `${runs.length} 筆`;
    ui.downloadAllJsonBtn.disabled = runs.length === 0;
    ui.downloadAllMdBtn.disabled = runs.length === 0;

    if (runs.length === 0) {
        ui.runsList.innerHTML = '<p class="empty-state">找不到跑步活動，請確認 Strava 帳號中是否有 `Run` 類型資料。</p>';
        ui.runsPagination.classList.add("hidden");
        return;
    }

    const startIndex = (state.runsPage - 1) * RUNS_PER_PAGE;
    const pageRuns = runs.slice(startIndex, startIndex + RUNS_PER_PAGE);
    const fragment = document.createDocumentFragment();
    pageRuns.forEach((run) => {
        const card = document.createElement("article");
        card.className = "run-card";

        const badge = run.averageHeartrate
            ? `平均 ${run.averageHeartrate} bpm`
            : run.distanceKm >= 14
                ? "長距離"
                : "一般跑";

        card.innerHTML = `
            <div class="run-header">
                <div>
                    <h3 class="run-title">${escapeHtml(run.name)}</h3>
                    <p class="run-date">${run.dateLabel}</p>
                </div>
                <span class="run-badge">${badge}</span>
            </div>
            <div class="run-metrics">
                <div class="metric-box">
                    <span class="metric-label">距離</span>
                    <strong class="metric-value">${formatDistance(run.distanceKm)}</strong>
                </div>
                <div class="metric-box">
                    <span class="metric-label">時間</span>
                    <strong class="metric-value">${run.movingTimeLabel}</strong>
                </div>
                <div class="metric-box">
                    <span class="metric-label">平均配速</span>
                    <strong class="metric-value">${run.averagePaceLabel}</strong>
                </div>
                <div class="metric-box">
                    <span class="metric-label">爬升</span>
                    <strong class="metric-value">${Math.round(run.elevationGain)} m</strong>
                </div>
            </div>
            <div class="run-actions">
                <button class="btn btn-primary js-toggle-details" type="button" data-run-id="${run.id}">展開分析</button>
                <button class="btn btn-ghost js-download-run" type="button" data-run-id="${run.id}">下載 JSON</button>
            </div>
            <div id="details-${run.id}" class="run-details hidden"></div>
        `;

        fragment.appendChild(card);
    });

    ui.runsList.innerHTML = "";
    ui.runsList.appendChild(fragment);
    renderRunsPagination(runs.length, totalPages);

    ui.runsList.querySelectorAll(".js-toggle-details").forEach((button) => {
        button.addEventListener("click", async () => {
            const runId = Number(button.getAttribute("data-run-id"));
            await toggleRunDetails(runId, button);
        });
    });

    ui.runsList.querySelectorAll(".js-download-run").forEach((button) => {
        button.addEventListener("click", async () => {
            const runId = Number(button.getAttribute("data-run-id"));
            await downloadRunJson(runId, button);
        });
    });
}

function renderRunsPagination(totalRuns, totalPages) {
    if (totalRuns <= RUNS_PER_PAGE) {
        ui.runsPagination.classList.add("hidden");
        return;
    }

    ui.runsPagination.classList.remove("hidden");
    ui.runsPageInfo.textContent = `第 ${state.runsPage} / ${totalPages} 頁`;
    ui.runsPrevBtn.disabled = state.runsPage <= 1;
    ui.runsNextBtn.disabled = state.runsPage >= totalPages;
}

function changeRunsPage(direction) {
    if (!state.summary?.runs?.length) {
        return;
    }

    const totalPages = Math.max(1, Math.ceil(state.summary.runs.length / RUNS_PER_PAGE));
    const nextPage = Math.min(totalPages, Math.max(1, state.runsPage + direction));

    if (nextPage === state.runsPage) {
        return;
    }

    state.runsPage = nextPage;
    renderRuns(state.summary.runs);
    ui.runsList.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function toggleRunDetails(runId, button) {
    const container = document.getElementById(`details-${runId}`);
    if (!container) {
        return;
    }

    if (!container.classList.contains("hidden")) {
        container.classList.add("hidden");
        button.textContent = "展開分析";
        return;
    }

    container.classList.remove("hidden");
    button.textContent = "收合分析";

    if (state.detailCache.has(runId)) {
        renderRunDetail(container, runId, state.detailCache.get(runId));
        return;
    }

    container.innerHTML = '<p class="detail-copy">正在載入分段與曲線資料...</p>';

    try {
        const detailBundle = await fetchRunDetailBundle(runId);
        state.detailCache.set(runId, detailBundle);
        renderRunDetail(container, runId, detailBundle);
    } catch (error) {
        console.error(error);
        container.innerHTML = `<p class="detail-copy">無法載入這筆活動的細節資料：${escapeHtml(error.message)}</p>`;
    }
}

/**
 * Fetch one run detail bundle, preferring IndexedDB cache before network.
 *
 * Parameters:
 * - runId (number): Strava activity id.
 *
 * Returns:
 * - Promise<object>: Detail bundle including detail and streams.
 *
 * Raises:
 * - Error: Raised when authorization is invalid or API responses fail.
 */
async function fetchRunDetailBundle(runId) {
    const cachedBundle = await loadCachedRunBundle(runId);
    if (cachedBundle) {
        return cachedBundle;
    }

    const token = await ensureValidToken();
    if (!token) {
        throw new Error("授權已失效，請重新登入 Strava。");
    }

    const [detailResp, streamResp] = await Promise.all([
        fetch(`https://www.strava.com/api/v3/activities/${runId}`, {
            headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(
            `https://www.strava.com/api/v3/activities/${runId}/streams/distance,heartrate,velocity_smooth,altitude?key_by_type=true`,
            {
                headers: { Authorization: `Bearer ${token}` },
            },
        ),
    ]);

    if (!detailResp.ok) {
        throw new Error(`活動細節 API 錯誤 (${detailResp.status})`);
    }

    const detail = await detailResp.json();
    const streams = streamResp.ok ? await streamResp.json() : {};

    const bundle = { detail, streams };
    await saveCachedRunBundle(runId, bundle);
    return bundle;
}

function renderRunDetail(container, runId, bundle) {
    const detail = bundle.detail;
    const splits = Array.isArray(detail.splits_metric) ? detail.splits_metric : [];
    const heartRate = detail.average_heartrate == null ? "--" : `${Math.round(detail.average_heartrate)} bpm`;
    const cadence = detail.average_cadence == null ? "--" : `${detail.average_cadence.toFixed(1)} spm`;
    const calories = detail.calories == null ? "--" : `${Math.round(detail.calories)} kcal`;
    const sufferScore = detail.suffer_score == null ? "--" : String(detail.suffer_score);
    const chartId = `run-chart-${runId}`;

    const best5k = calculateBestSegmentEffort(
        {
            id: runId,
            name: detail.name || "未命名跑步",
            dateLabel: detail.start_date_local ? formatTaiwanDate(detail.start_date_local) : "未知日期",
            startedAt: parseStravaLocalDate(detail.start_date_local) || new Date(Date.now()),
        },
        splits,
        5,
    );

    let splitsHtml = '<p class="detail-copy">這筆活動沒有每公里 splits 資料。</p>';
    if (splits.length > 0) {
        const rows = splits
            .map((split) => {
                const pace = split.average_speed ? formatPaceFromSpeed(split.average_speed) : "--";
                const splitHr = split.average_heartrate == null ? "--" : `${Math.round(split.average_heartrate)}`;
                const climb = split.elevation_difference == null ? "0" : `${Math.round(split.elevation_difference)}`;
                return `
                    <tr>
                        <td>${split.split}</td>
                        <td>${pace}</td>
                        <td>${splitHr}</td>
                        <td>${climb}</td>
                    </tr>
                `;
            })
            .join("");

        splitsHtml = `
            <table class="splits-table">
                <thead>
                    <tr>
                        <th>公里</th>
                        <th>配速</th>
                        <th>心率</th>
                        <th>爬升</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    container.innerHTML = `
        <div class="detail-grid">
            <div class="detail-card">
                <div class="detail-title">平均心率</div>
                <p class="detail-copy">${heartRate}</p>
            </div>
            <div class="detail-card">
                <div class="detail-title">平均步頻</div>
                <p class="detail-copy">${cadence}</p>
            </div>
            <div class="detail-card">
                <div class="detail-title">熱量</div>
                <p class="detail-copy">${calories}</p>
            </div>
            <div class="detail-card">
                <div class="detail-title">Suffer Score</div>
                <p class="detail-copy">${sufferScore}</p>
            </div>
        </div>
        <div class="detail-card">
            <div class="detail-title">活動內最佳 5K 區段</div>
            <p class="detail-copy">${best5k ? `${best5k.movingTimeLabel} · ${best5k.splitRangeLabel} · ${best5k.averagePaceLabel}` : "這筆活動無法估算完整 5K 區段"}</p>
        </div>
        <div>
            <div class="detail-title">分段分析</div>
            ${splitsHtml}
        </div>
        <div>
            <div class="detail-title">心率 / 配速曲線</div>
            <div class="chart-wrapper">
                <canvas id="${chartId}"></canvas>
            </div>
        </div>
    `;

    renderRunChart(chartId, bundle.streams);
}

function renderRunChart(canvasId, streams) {
    if (!window.Chart) {
        return;
    }

    const canvas = document.getElementById(canvasId);
    if (!canvas || !streams.distance?.data?.length) {
        return;
    }

    const previous = state.runCharts.get(canvasId);
    if (previous) {
        previous.destroy();
    }

    const labels = streams.distance.data.map((distance) => (distance / 1000).toFixed(1));
    const datasets = [];

    if (streams.heartrate?.data?.length) {
        datasets.push({
            label: "心率 (bpm)",
            data: streams.heartrate.data,
            borderColor: "rgba(251, 113, 133, 0.85)",
            backgroundColor: "rgba(251, 113, 133, 0.15)",
            tension: 0.28,
            pointRadius: 0,
            yAxisID: "heart",
        });
    }

    if (streams.velocity_smooth?.data?.length) {
        datasets.push({
            label: "配速 (min/km)",
            data: streams.velocity_smooth.data.map((speed) => {
                if (!speed || speed <= 0.3) {
                    return null;
                }

                return Number((1000 / speed / 60).toFixed(2));
            }),
            borderColor: "rgba(94, 234, 212, 0.92)",
            backgroundColor: "rgba(94, 234, 212, 0.16)",
            tension: 0.28,
            pointRadius: 0,
            spanGaps: true,
            yAxisID: "pace",
        });
    }

    const chart = new window.Chart(canvas, {
        type: "line",
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: {
                    labels: { color: "#edf6f3" },
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            if (context.dataset.yAxisID === "pace" && context.parsed.y != null) {
                                return `${context.dataset.label}: ${formatPaceFromSeconds(context.parsed.y * 60)}`;
                            }

                            return `${context.dataset.label}: ${Math.round(context.parsed.y)}`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    ticks: { color: "#99aebe" },
                    grid: { color: "rgba(153, 174, 190, 0.08)" },
                },
                heart: {
                    type: "linear",
                    position: "left",
                    ticks: { color: "#99aebe" },
                    grid: { color: "rgba(153, 174, 190, 0.08)" },
                },
                pace: {
                    type: "linear",
                    position: "right",
                    reverse: true,
                    ticks: { color: "#99aebe" },
                    grid: { drawOnChartArea: false },
                },
            },
        },
    });

    state.runCharts.set(canvasId, chart);
}

/**
 * Download one run as a JSON file using the run date as the filename prefix.
 *
 * Parameters:
 * - runId (number): The Strava run identifier.
 * - button (HTMLButtonElement): The action button used to trigger this export.
 *
 * Returns:
 * - Promise<void>: Resolves when the download flow is completed.
 *
 * Raises:
 * - No explicit throw. Errors are handled internally and reflected in button state.
 */
async function downloadRunJson(runId, button) {
    const run = state.summary?.runs.find((entry) => entry.id === runId);
    if (!run) {
        return;
    }

    button.disabled = true;
    button.textContent = "整理中...";

    try {
        const bundle = state.detailCache.has(runId) ? state.detailCache.get(runId) : await fetchRunDetailBundle(runId);
        state.detailCache.set(runId, bundle);

        const payload = {
            activity_id: run.id,
            name: run.name,
            summary: {
                date: run.dateLabel,
                distance_km: Number(run.distanceKm.toFixed(2)),
                moving_time_seconds: run.movingTimeSec,
                average_pace: run.averagePaceLabel,
                average_heartrate: run.averageHeartrate,
                total_elevation_gain_m: Math.round(run.elevationGain),
            },
            detail: bundle.detail,
            streams: bundle.streams,
        };

        const datedFilename = `${formatDateForFilename(run.startedAt)}_${slugifyFilename(run.name)}.json`;
        downloadJson(payload, datedFilename);
        button.textContent = "已下載";
        setTimeout(() => {
            button.disabled = false;
            button.textContent = "下載 JSON";
        }, 1200);
    } catch (error) {
        console.error(error);
        button.disabled = false;
        button.textContent = "下載失敗";
        setTimeout(() => {
            button.textContent = "下載 JSON";
        }, 1400);
    }
}

/**
 * Download all loaded runs as either a merged JSON file or a Markdown report.
 *
 * Parameters:
 * - format (("json"|"md")): The requested output format.
 *
 * Returns:
 * - Promise<void>: Resolves when export is completed or gracefully aborted.
 *
 * Raises:
 * - No explicit throw. Errors are handled and surfaced through status messages.
 */
async function downloadAllRuns(format) {
    if (!state.summary?.runs?.length) {
        setStatus("目前沒有可匯出的跑步資料。", "error");
        return;
    }

    const triggerButton = format === "json" ? ui.downloadAllJsonBtn : ui.downloadAllMdBtn;
    const originalLabel = triggerButton.textContent;
    triggerButton.disabled = true;
    triggerButton.textContent = "整理中...";

    try {
        const aggregate = await buildAggregateExportData(state.summary.runs);
        const timestamp = formatDateForFilename(new Date());

        if (format === "json") {
            downloadJson(aggregate, `${timestamp}_strava_runs_aggregate.json`);
            setStatus(`已匯出 ${aggregate.runs.length} 筆活動為單一 JSON。`, "success");
        } else {
            const markdown = buildAggregateMarkdown(aggregate);
            downloadText(markdown, `${timestamp}_strava_runs_aggregate.md`, "text/markdown");
            setStatus(`已匯出 ${aggregate.runs.length} 筆活動為 Markdown。`, "success");
        }
    } catch (error) {
        console.error(error);
        setStatus(`匯出失敗：${error.message}`, "error");
    } finally {
        triggerButton.disabled = false;
        triggerButton.textContent = originalLabel;
    }
}

/**
 * Build a merged export object containing all runs and their cached/fetched details.
 *
 * Parameters:
 * - runs (Array<object>): The run list from summary state.
 *
 * Returns:
 * - Promise<object>: A normalized aggregate payload for export.
 *
 * Raises:
 * - Error: Propagates errors from detail fetch for visibility in caller.
 */
async function buildAggregateExportData(runs) {
    const records = [];

    for (const run of runs) {
        const bundle = state.detailCache.has(run.id) ? state.detailCache.get(run.id) : await fetchRunDetailBundle(run.id);
        state.detailCache.set(run.id, bundle);

        records.push({
            activity_id: run.id,
            date: run.dateLabel,
            started_at_local: run.startedAt?.toISOString?.() || null,
            name: run.name,
            summary: {
                distance_km: Number(run.distanceKm.toFixed(2)),
                moving_time_seconds: run.movingTimeSec,
                average_pace: run.averagePaceLabel,
                average_heartrate: run.averageHeartrate,
                total_elevation_gain_m: Math.round(run.elevationGain),
            },
            detail: bundle.detail,
            streams: bundle.streams,
        });
    }

    return {
        exported_at: new Date().toISOString(),
        run_count: records.length,
        runs: records,
    };
}

/**
 * Convert aggregate run data into a Markdown report.
 *
 * Parameters:
 * - aggregate (object): Aggregate payload generated by buildAggregateExportData.
 *
 * Returns:
 * - string: Markdown document content.
 *
 * Raises:
 * - No explicit throw. Assumes aggregate payload shape is valid.
 */
function buildAggregateMarkdown(aggregate) {
    const lines = [
        "# Strava Runs Aggregate Export",
        "",
        `- Exported at: ${aggregate.exported_at}`,
        `- Run count: ${aggregate.run_count}`,
        "",
    ];

    aggregate.runs.forEach((run, index) => {
        lines.push(`## ${index + 1}. ${run.name}`);
        lines.push(`- Date: ${run.date}`);
        lines.push(`- Distance: ${run.summary.distance_km} km`);
        lines.push(`- Moving time: ${run.summary.moving_time_seconds} sec`);
        lines.push(`- Average pace: ${run.summary.average_pace}`);
        lines.push(
            `- Average heartrate: ${run.summary.average_heartrate == null ? "--" : `${run.summary.average_heartrate} bpm`}`,
        );
        lines.push(`- Elevation gain: ${run.summary.total_elevation_gain_m} m`);

        const splits = Array.isArray(run.detail?.splits_metric) ? run.detail.splits_metric.slice(0, 8) : [];
        if (splits.length > 0) {
            lines.push("");
            lines.push("| Km | Pace | HR | Elevation |");
            lines.push("| --- | --- | --- | --- |");
            splits.forEach((split) => {
                const pace = split.average_speed ? formatPaceFromSpeed(split.average_speed) : "--";
                const hr = split.average_heartrate == null ? "--" : Math.round(split.average_heartrate);
                const elevation = Math.round(split.elevation_difference || 0);
                lines.push(`| ${split.split} | ${pace} | ${hr} | ${elevation} m |`);
            });
        }

        lines.push("");
    });

    return lines.join("\n");
}

/**
 * Download text content as a local file.
 *
 * Parameters:
 * - content (string): The plain text content to save.
 * - filename (string): The target filename for the browser download.
 * - mimeType (string): MIME type for the generated blob.
 *
 * Returns:
 * - void: This helper performs side effects only.
 *
 * Raises:
 * - No explicit throw. Browser download APIs may fail silently in restricted contexts.
 */
function downloadText(content, filename, mimeType = "text/plain") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

/**
 * Convert a date-like value into YYYY-MM-DD for stable filenames.
 *
 * Parameters:
 * - dateInput (Date|string|number): Input value convertible to Date.
 *
 * Returns:
 * - string: Normalized date label (YYYY-MM-DD), fallback to "unknown-date".
 *
 * Raises:
 * - No explicit throw. Invalid dates return a fallback string.
 */
function formatDateForFilename(dateInput) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(date.getTime())) {
        return "unknown-date";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * Sanitize text for safe filename usage.
 *
 * Parameters:
 * - value (string): Original text.
 *
 * Returns:
 * - string: Lower-risk filename segment.
 *
 * Raises:
 * - No explicit throw. Empty results fallback to "run".
 */
function slugifyFilename(value) {
    const sanitized = String(value)
        .trim()
        .replace(/[^\p{Letter}\p{Number}_-]+/gu, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

    return sanitized || "run";
}

/**
 * Download an object payload as a JSON file.
 *
 * Parameters:
 * - payload (object): JSON-serializable content.
 * - filename (string): Target filename.
 *
 * Returns:
 * - void: This helper performs side effects only.
 *
 * Raises:
 * - No explicit throw. Browser download APIs may fail silently in restricted contexts.
 */
function downloadJson(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

async function generateCoachPrompt(provider) {
    if (!state.summary || state.summary.runs.length === 0) {
        setStatus("沒有可用的跑步資料，請先完成授權並載入活動。", "error");
        return;
    }

    ui.promptContainer.classList.remove("hidden");
    ui.copyToast.classList.add("hidden");
    ui.coachPrompt.value = "正在整理近期重點課表與能力預測...";

    try {
        const highlightedRuns = state.summary.runs.slice(0, 3);
        const bundles = await Promise.all(
            highlightedRuns.map(async (run) => {
                if (state.detailCache.has(run.id)) {
                    return [run.id, state.detailCache.get(run.id)];
                }

                const bundle = await fetchRunDetailBundle(run.id);
                state.detailCache.set(run.id, bundle);
                return [run.id, bundle];
            }),
        );

        const detailMap = new Map(bundles);
        ui.coachPrompt.value = buildCoachPrompt(provider, state.summary, highlightedRuns, detailMap);
    } catch (error) {
        console.error(error);
        ui.coachPrompt.value = `整理提示詞時發生錯誤：${error.message}`;
    }
}

function buildCoachPrompt(provider, summary, highlightedRuns, detailMap) {
    const best1k = getDisplayBestEffort(summary, "1K");
    const best3k = getDisplayBestEffort(summary, "3K");
    const best5k = getDisplayBestEffort(summary, "5K");
    const best10k = getDisplayBestEffort(summary, "10K");
    const pb1k = best1k
        ? `${formatDuration(best1k.movingTimeSec)} (${best1k.dateLabel}${best1k.splitRangeLabel ? `, ${best1k.splitRangeLabel}` : ""}, ${formatPaceFromSeconds(best1k.averagePaceSec)})`
        : "目前沒有可用的 1K 區段";
    const pb3k = best3k
        ? `${formatDuration(best3k.movingTimeSec)} (${best3k.dateLabel}${best3k.splitRangeLabel ? `, ${best3k.splitRangeLabel}` : ""}, ${formatPaceFromSeconds(best3k.averagePaceSec)})`
        : "目前沒有可用的 3K 區段";
    const pb5k = best5k
        ? `${formatDuration(best5k.movingTimeSec)} (${best5k.dateLabel}${best5k.splitRangeLabel ? `, ${best5k.splitRangeLabel}` : ""}, ${formatPaceFromSeconds(best5k.averagePaceSec)})`
        : "目前沒有可用的 5K 區段";
    const pb10k = best10k
        ? `${formatDuration(best10k.movingTimeSec)} (${best10k.dateLabel}${best10k.splitRangeLabel ? `, ${best10k.splitRangeLabel}` : ""}, ${formatPaceFromSeconds(best10k.averagePaceSec)})`
        : "目前沒有可用的 10K 區段";

    let prompt = `你是我的 ${provider} 跑步教練，請用繁體中文分析以下 Strava 跑步資料。\n\n`;
    prompt += `整體摘要\n`;
    prompt += `- 本月跑量：${formatDistance(summary.totals.monthDistanceKm)}，共 ${summary.totals.monthCount} 次跑步\n`;
    prompt += `- 本週跑量：${formatDistance(summary.totals.weekDistanceKm)}，共 ${summary.totals.weekCount} 次跑步\n`;
    prompt += `- 最近 4 次平均配速：${formatPaceFromSeconds(summary.totals.recentAveragePaceSec)}\n`;
    prompt += `- 最近 4 次平均心率：${summary.totals.recentAverageHr == null ? "--" : `${Math.round(summary.totals.recentAverageHr)} bpm`}\n`;
    prompt += `- 最近 7 天跑量：${formatDistance(summary.totals.recentSevenDayDistanceKm)}\n`;
    prompt += `- 最長距離：${formatDistance(summary.totals.longestRunKm)}\n`;
    prompt += `- 同距離配速變化：${formatDeltaPace(summary.insight.paceDeltaSec)}\n`;
    prompt += `- 訓練穩定度：${summary.totals.consistencyScore}\n`;
    prompt += `- 最佳 1K 區段：${pb1k}\n`;
    prompt += `- 最佳 3K 區段：${pb3k}\n`;
    prompt += `- 最佳 5K 區段：${pb5k}\n`;
    prompt += `- 最佳 10K 區段：${pb10k}\n`;

    if (summary.prediction) {
        prompt += `- 能力模型：${summary.prediction.model} VDOT ${summary.prediction.vdot.toFixed(1)}\n`;
        prompt += `- 預估 5K：${summary.prediction.predictions["5K"].vdotTimeLabel}\n`;
        prompt += `- 預估 10K：${summary.prediction.predictions["10K"].vdotTimeLabel}\n`;
        prompt += `- 預估半馬：${summary.prediction.predictions.Half.vdotTimeLabel}\n`;
        prompt += `- 預估全馬：${summary.prediction.predictions.Marathon.vdotTimeLabel}\n`;
        prompt += `- 模型提醒：${summary.prediction.caution}\n`;
    }

    prompt += `- 趨勢判讀：${summary.insight.headline}\n`;
    prompt += `- 趨勢摘要：${summary.insight.summary}\n\n`;
    prompt += `近期關鍵跑步\n`;

    highlightedRuns.forEach((run, index) => {
        const bundle = detailMap.get(run.id);
        const splits = bundle?.detail?.splits_metric || [];
        const segment5k = calculateBestSegmentEffort(run, splits, 5);

        prompt += `${index + 1}. ${run.name}\n`;
        prompt += `   - 日期：${run.dateLabel}\n`;
        prompt += `   - 距離：${formatDistance(run.distanceKm)}\n`;
        prompt += `   - 時間：${run.movingTimeLabel}\n`;
        prompt += `   - 平均配速：${run.averagePaceLabel}\n`;
        prompt += `   - 平均心率：${run.averageHeartrate == null ? "--" : `${run.averageHeartrate} bpm`}\n`;
        prompt += `   - 爬升：${Math.round(run.elevationGain)} m\n`;
        prompt += `   - 活動內最佳 5K：${segment5k ? `${segment5k.movingTimeLabel} (${segment5k.splitRangeLabel}, ${segment5k.averagePaceLabel})` : "無法估算"}\n`;

        if (splits.length > 0) {
            prompt += `   - 每公里 splits：\n`;
            splits.slice(0, 8).forEach((split) => {
                prompt += `     - ${split.split}K: ${split.average_speed ? formatPaceFromSpeed(split.average_speed) : "--"}, 心率 ${split.average_heartrate == null ? "--" : Math.round(split.average_heartrate)}, 爬升 ${Math.round(split.elevation_difference || 0)} m\n`;
            });
        } else {
            prompt += `   - 每公里 splits：無\n`;
        }
    });

    prompt += `\n請直接輸出：\n`;
    prompt += `1. 我目前的跑步能力分析。\n`;
    prompt += `2. 5K、10K、半馬、全馬預測成績是否合理，哪個距離最有把握。\n`;
    prompt += `3. 從跑量、配速、心率與活動內最佳 5K 區段看出的進步點與風險。\n`;
    prompt += `4. 接下來 7 天的 3 次課表安排，包含目的、距離或時間、配速建議。\n`;
    prompt += `5. 如果你認為目前預測偏樂觀，也請直接指出原因。\n`;

    return prompt;
}

async function handleCopyPrompt() {
    if (!ui.coachPrompt.value.trim()) {
        return;
    }

    try {
        await navigator.clipboard.writeText(ui.coachPrompt.value);
        ui.copyToast.classList.remove("hidden");
        setTimeout(() => ui.copyToast.classList.add("hidden"), 1600);
    } catch (error) {
        setStatus(`複製失敗：${error.message}`, "error");
    }
}

function renderEmptyDashboard() {
    ui.monthMileage.textContent = "0.0 km";
    ui.monthCount.textContent = "0 次跑步";
    ui.weekMileage.textContent = "0.0 km";
    ui.weekCount.textContent = "0 次跑步";
    ui.recentPace.textContent = "--";
    ui.recentPaceNote.textContent = "最近 4 次活動";
    ui.recentHr.textContent = "--";
    ui.recentHrNote.textContent = "最近 4 次活動";
    if (ui.acwrScore && ui.acwrNote) {
        ui.acwrScore.textContent = "--";
        ui.acwrNote.textContent = "7 天 / 28 天週均跑量";
    }
    if (ui.efficiencyScore && ui.efficiencyNote) {
        ui.efficiencyScore.textContent = "--";
        ui.efficiencyNote.textContent = "最近 6 次速度 / 心率";
    }
    if (ui.recentCadence && ui.recentCadenceNote) {
        ui.recentCadence.textContent = "--";
        ui.recentCadenceNote.textContent = "最近 6 次活動";
    }
    if (ui.elevationDensity && ui.elevationDensityNote) {
        ui.elevationDensity.textContent = "--";
        ui.elevationDensityNote.textContent = "最近 6 次平均每公里爬升";
    }
    if (ui.pb1k && ui.pb1kDate) {
        ui.pb1k.textContent = "--";
        ui.pb1kDate.textContent = "尚無資料";
    }
    if (ui.pb3k && ui.pb3kDate) {
        ui.pb3k.textContent = "--";
        ui.pb3kDate.textContent = "尚無資料";
    }
    ui.pb5k.textContent = "--";
    ui.pb5kDate.textContent = "尚無資料";
    ui.pb10k.textContent = "--";
    ui.pb10kDate.textContent = "尚無資料";
    ui.trainingHeadline.textContent = "等待資料載入";
    ui.trainingSummary.textContent = "成功連接 Strava 後，這裡會整理你的近期負荷、同距離配速變化與能力預測。";
    ui.recentLoad.textContent = "0.0 km";
    ui.longestRun.textContent = "0.0 km";
    ui.paceDelta.textContent = "--";
    ui.consistencyScore.textContent = "--";
    if (ui.avgRunDistance) {
        ui.avgRunDistance.textContent = "--";
    }
    if (ui.avgRunDuration) {
        ui.avgRunDuration.textContent = "--";
    }
    if (ui.qualityRunRatio) {
        ui.qualityRunRatio.textContent = "--";
    }
    if (ui.hrDeltaTrend) {
        ui.hrDeltaTrend.textContent = "--";
    }
    if (ui.longRunShare) {
        ui.longRunShare.textContent = "--";
    }
    ui.abilityModel.textContent = "VDOT";
    ui.abilityScore.textContent = "--";
    ui.predictionSource.textContent = "等待資料分析";
    ui.pred5k.textContent = "--";
    ui.pred10k.textContent = "--";
    ui.predHalf.textContent = "--";
    ui.predMarathon.textContent = "--";
    ui.predictionNote.textContent = "完成資料載入後，會根據最近的最佳表現估計能力。";
    ui.runsCount.textContent = "0 筆";
    ui.runsList.innerHTML = '<p class="empty-state">尚未載入活動資料。</p>';
    ui.runsPagination.classList.add("hidden");
    ui.runsPageInfo.textContent = "第 1 / 1 頁";
    ui.runsPrevBtn.disabled = true;
    ui.runsNextBtn.disabled = true;
    ui.downloadAllJsonBtn.disabled = true;
    ui.downloadAllMdBtn.disabled = true;
    ui.promptContainer.classList.add("hidden");

    if (state.weeklyChart) {
        state.weeklyChart.destroy();
        state.weeklyChart = null;
    }
}

function formatTaiwanDate(dateInput) {
    const date = parseStravaLocalDate(dateInput) || new Date(dateInput);
    if (Number.isNaN(date.getTime())) {
        return "未知日期";
    }

    return date.toLocaleDateString("zh-TW");
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
