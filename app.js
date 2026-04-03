import { state, ui, STORAGE_KEYS } from "./state.js";
import { openAppDb, readDbRecord, writeDbRecord, clearCachedDatabase, loadCachedRuns } from "./db.js";
import { setStatus, clearStatus, stripAuthParams, setActionState } from "./ui-utils.js";
import { 
    startStravaLogin, 
    exchangeCodeForToken, 
    ensureValidToken, 
    clearTokenStorage,
    getCredentials
} from "./auth.js";
import { 
    fetchRunActivities, 
    fetchAthleteZones, 
    fetchRunDetailBundle 
} from "./api.js";
import { 
    summariseActivities, 
    calculateBestSegmentEffort, 
    mergeBestEffort, 
    buildAbilityPrediction 
} from "./analytics.js";
import { toLocalDateKey, escapeHtml } from "./utils.js";

// Components
import { renderCalendar, setCalendarHeatmapMode, syncHeatmapModeUi } from "./components/calendar.js";
import { renderRuns, renderRunDetailsContent } from "./components/runs-list.js";
import { renderWeeklyChart } from "./components/charts.js";
import { renderTopStats, renderInsight, renderPrediction } from "./components/dashboard.js";

// Export Utils (external)
// import * as ExportUtils from "./export-utils.js"; 
// Note: We'll call these dynamically or import if they are modules. 
// Assuming they are global for now or we update them to modules.

/**
 * Main Application Controller
 */

document.addEventListener("DOMContentLoaded", initApp);

async function initApp() {
    bindUi();
    wireEvents();
    
    // Handle OAuth Redirect
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const incomingState = urlParams.get("state");
    const error = urlParams.get("error");

    if (error) {
        setStatus(`Strava 授權失敗：${error}`, "error");
        stripAuthParams();
    } else if (code) {
        try {
            setStatus("正在交換 Strava 存取憑證...", "info");
            await exchangeCodeForToken(code, incomingState);
            stripAuthParams();
            await loadDashboard();
        } catch (err) {
            setStatus(err.message, "error");
            stripAuthParams();
            showAuthState();
        }
    } else {
        await loadDashboard();
    }

    registerServiceWorker();
    bindInstallPrompt();
}

function bindUi() {
    // Auth & Setup
    ui.setupView = document.getElementById("setup-view");
    ui.authView = document.getElementById("auth-view");
    ui.dashboardView = document.getElementById("dashboard-view");
    ui.statusBanner = document.getElementById("status-banner");
    
    ui.clientIdInput = document.getElementById("client-id");
    ui.clientSecretInput = document.getElementById("client-secret");
    ui.saveConfigBtn = document.getElementById("save-config");
    ui.loginBtn = document.getElementById("login-btn");
    ui.logoutBtn = document.getElementById("logout-btn");
    ui.refreshDataBtn = document.getElementById("refresh-data");

    // Dashboard Tabs
    ui.tabBtns = document.querySelectorAll(".nav-tab");
    ui.tabPanels = document.querySelectorAll(".tab-panel");

    // Stats Elements
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

    // PB Elements
    ui.pb5k = document.getElementById("pb-5k");
    ui.pb5kDate = document.getElementById("pb-5k-date");
    ui.pb10k = document.getElementById("pb-10k");
    ui.pb10kDate = document.getElementById("pb-10k-date");
    ui.pb1k = document.getElementById("pb-1k");
    ui.pb1kDate = document.getElementById("pb-1k-date");
    ui.pb3k = document.getElementById("pb-3k");
    ui.pb3kDate = document.getElementById("pb-3k-date");

    // Insight & Prediction
    ui.trainingHeadline = document.getElementById("training-headline");
    ui.trainingSummary = document.getElementById("training-summary");
    ui.recentLoad = document.getElementById("recent-load");
    ui.longestRun = document.getElementById("longest-run");
    ui.paceDelta = document.getElementById("pace-delta");
    ui.consistencyScore = document.getElementById("consistency-score");
    
    ui.abilityModel = document.getElementById("ability-model");
    ui.abilityScore = document.getElementById("ability-score");
    ui.predictionSource = document.getElementById("prediction-source");
    ui.pred5k = document.getElementById("pred-5k");
    ui.pred10k = document.getElementById("pred-10k");
    ui.predHalf = document.getElementById("pred-half");
    ui.predMarathon = document.getElementById("pred-marathon");
    ui.predictionNote = document.getElementById("prediction-note");

    // Calendar
    ui.calendarGrid = document.getElementById("calendar-grid");
    ui.calMonthLabel = document.getElementById("cal-month-label");
    ui.calPrevBtn = document.getElementById("cal-prev");
    ui.calNextBtn = document.getElementById("cal-next");
    ui.heatmapLegend = document.getElementById("heatmap-legend");
    ui.heatmapModePills = document.querySelectorAll("[data-heatmap-mode]");

    // Runs List
    ui.runsList = document.getElementById("runs-list");
    ui.runsCount = document.getElementById("runs-count");
    ui.runsPagination = document.getElementById("runs-pagination");
    ui.runsPageInfo = document.getElementById("runs-page-info");
    ui.runsPrevBtn = document.getElementById("runs-prev");
    ui.runsNextBtn = document.getElementById("runs-next");

    // Charts
    ui.weeklyChartCanvas = document.getElementById("weekly-chart");

    // Coach Prompt
    ui.promptContainer = document.getElementById("prompt-container");
    ui.coachPrompt = document.getElementById("coach-prompt");
    ui.copyPromptBtn = document.getElementById("copy-prompt");
    ui.copyToast = document.getElementById("copy-toast");
    ui.coachBtns = document.querySelectorAll(".btn-coach");

    // Exports
    ui.downloadAllJsonBtn = document.getElementById("download-all-json");
    ui.downloadAllMdBtn = document.getElementById("download-all-md");

    // Install
    ui.installBanner = document.getElementById("install-banner");
    ui.installBtn = document.getElementById("install-btn");
}

function wireEvents() {
    // Auth & Config
    ui.saveConfigBtn?.addEventListener("click", () => {
        localStorage.setItem(STORAGE_KEYS.clientId, ui.clientIdInput.value.trim());
        localStorage.setItem(STORAGE_KEYS.clientSecret, ui.clientSecretInput.value.trim());
        loadDashboard();
    });

    ui.loginBtn?.addEventListener("click", () => {
        const result = startStravaLogin();
        if (result === "SETUP_REQUIRED") showSetupState();
    });

    ui.logoutBtn?.addEventListener("click", () => {
        if (confirm("確定要登出並清除所有本機快取資料嗎？")) {
            clearTokenStorage();
            clearCachedDatabase().then(() => window.location.reload());
        }
    });

    ui.refreshDataBtn?.addEventListener("click", () => loadDashboard());

    // Tabs
    ui.tabBtns.forEach(btn => {
        btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    // Calendar Navigation
    ui.calPrevBtn?.addEventListener("click", () => changeCalendarMonth(-1));
    ui.calNextBtn?.addEventListener("click", () => changeCalendarMonth(1));
    ui.heatmapModePills.forEach(pill => {
        pill.addEventListener("click", () => setCalendarHeatmapMode(pill.dataset.heatmapMode));
    });

    // Runs Pagination
    ui.runsPrevBtn?.addEventListener("click", () => changeRunsPage(-1));
    ui.runsNextBtn?.addEventListener("click", () => changeRunsPage(1));

    // Coach Prompts
    ui.coachBtns.forEach(btn => {
        btn.addEventListener("click", () => generateCoachPrompt(btn.dataset.provider));
    });
    ui.copyPromptBtn?.addEventListener("click", handleCopyPrompt);

    // Custom Component Events
    window.addEventListener("stride:focus-run", (e) => focusRunFromCalendar(e.detail.runId));
    window.addEventListener("stride:load-run-details", (e) => loadAndRenderRunDetails(e.detail.runId, e.detail.target));
    window.addEventListener("stride:download-run-json", (e) => {
        // Dynamic fetch of download utility if needed
        import("./export-utils.js").then(m => m.downloadRunJson(e.detail.runId, state.summary, state.detailCache));
    });

    // Exports
    ui.downloadAllJsonBtn?.addEventListener("click", () => {
        import("./export-utils.js").then(m => m.downloadAllRuns("json", state.summary, state.detailCache));
    });
    ui.downloadAllMdBtn?.addEventListener("click", () => {
        import("./export-utils.js").then(m => m.downloadAllRuns("md", state.summary, state.detailCache));
    });
}

async function loadDashboard() {
    const token = await ensureValidToken();
    if (!token) {
        const { clientId } = getCredentials();
        if (!clientId) showSetupState();
        else showAuthState();
        return;
    }

    showDashboardState();
    clearStatus();
    renderEmptyDashboard();
    ui.runsList.innerHTML = '<p class="empty-state">正在載入跑步資料...</p>';

    try {
        const [activities, athleteZones] = await Promise.all([
            fetchRunActivities(token),
            fetchAthleteZones(token),
        ]);
        
        state.athleteZones = athleteZones;
        state.summary = summariseActivities(activities, new Date());
        
        renderAppLayout(state.summary);

        const athleteName = localStorage.getItem(STORAGE_KEYS.athleteName);
        const prefix = athleteName ? `${athleteName}，` : "";
        setStatus(`${prefix}已載入 ${state.summary.runs.length} 筆活動。`, "success");

        // Start background enrichment
        state.enrichmentRunId++;
        enrichPerformanceInsights(state.enrichmentRunId);
    } catch (err) {
        console.error(err);
        showAuthState();
        setStatus(`載入載入失敗：${err.message}`, "error");
    }
}

function renderAppLayout(summary) {
    state.runsPage = 1;
    renderTopStats(summary);
    renderInsight(summary);
    renderPrediction(summary);
    renderWeeklyChart(summary.weeklyTrend);
    renderCalendar(summary.runs);
    renderRuns(summary.runs);
    syncHeatmapModeUi();
}

async function enrichPerformanceInsights(id) {
    if (!state.summary) return;
    
    // Recently 40 runs within 180 days
    const recent = state.summary.runs
        .filter(r => r.distanceKm >= 1 && r.startedAt >= new Date(Date.now() - 180 * 24 * 60 * 60 * 1000))
        .slice(0, 40);

    if (recent.length === 0) return;

    setStatus(`正在深度分析最近 ${recent.length} 筆活動的區段表現...`, "info");

    const batchSize = 4;
    for (let i = 0; i < recent.length; i += batchSize) {
        if (id !== state.enrichmentRunId) return;

        const batch = recent.slice(i, i + batchSize);
        const bundles = await Promise.all(batch.map(async r => {
            try {
                if (state.detailCache.has(r.id)) return { run: r, bundle: state.detailCache.get(r.id) };
                // Using modular fetcher (which handles IndexedDB cache internally)
                // Wait, api.js fetchRunDetailBundle doesn't handle IDB read, we should use a wrapper or fix it.
                // Let's use a project-specific wrapper here or in api.js.
                const bundle = await loadRunDetailBundleWithCache(r.id);
                state.detailCache.set(r.id, bundle);
                return { run: r, bundle };
            } catch (err) {
                return { run: r, bundle: null };
            }
        }));

        bundles.forEach(({ run, bundle }) => {
            const splits = bundle?.detail?.splits_metric;
            if (!Array.isArray(splits)) return;

            [1, 3, 5, 10].forEach(dist => {
                const key = `segment${dist}k`;
                const effort = calculateBestSegmentEffort(run, splits, dist);
                state.summary.bests[key] = mergeBestEffort(state.summary.bests[key], effort);
            });
        });

        // Update predictions and stats after each batch
        updatePredictionAndStats();
    }

    if (id === state.enrichmentRunId) {
        setStatus("區段分析完成，預測已更新。", "success");
    }
}

async function loadRunDetailBundleWithCache(runId) {
    const { APP_DB_STORES } = await import("./state.js");
    const { readDbRecord, writeDbRecord } = await import("./db.js");
    
    const cached = await readDbRecord(APP_DB_STORES.bundles, runId);
    if (cached) return cached.bundle;

    const token = await ensureValidToken();
    const bundle = await fetchRunDetailBundle(token, runId);
    
    await writeDbRecord(APP_DB_STORES.bundles, {
        runId,
        savedAt: new Date().toISOString(),
        bundle
    });
    return bundle;
}

function updatePredictionAndStats() {
    state.summary.prediction = buildAbilityPredictionFromSummary(state.summary);
    renderTopStats(state.summary);
    renderPrediction(state.summary);
}

function buildAbilityPredictionFromSummary(summary) {
    const recent = summary.runs
        .filter(r => r.startedAt >= new Date(Date.now() - 180 * 24 * 60 * 60 * 1000))
        .filter(r => r.distanceKm >= 3 && r.distanceKm <= 21.1)
        .slice(0, 16);

    return buildAbilityPrediction([
        summary.bests.segment5k,
        summary.bests.segment10k,
        summary.bests.segment3k,
        summary.bests.fullRun3k,
        summary.bests.fullRun5k,
        summary.bests.fullRun10k,
        ...recent
    ]);
}

// UI State Switchers

function showSetupState() {
    ui.setupView.classList.remove("hidden");
    ui.authView.classList.add("hidden");
    ui.dashboardView.classList.add("hidden");
}

function showAuthState() {
    ui.setupView.classList.add("hidden");
    ui.authView.classList.remove("hidden");
    ui.dashboardView.classList.add("hidden");
    const { clientId } = getCredentials();
    ui.clientIdInput.value = clientId;
    ui.clientSecretInput.value = localStorage.getItem(STORAGE_KEYS.clientSecret) || "";
}

function showDashboardState() {
    ui.setupView.classList.add("hidden");
    ui.authView.classList.add("hidden");
    ui.dashboardView.classList.remove("hidden");
}

function switchTab(tabId) {
    state.dashboardTab = tabId;
    ui.tabBtns.forEach(btn => btn.classList.toggle("is-active", btn.dataset.tab === tabId));
    ui.tabPanels.forEach(panel => panel.classList.toggle("hidden", panel.id !== `tab-${tabId}`));
}

function changeCalendarMonth(offset) {
    let m = state.calMonth + offset;
    let y = state.calYear;
    if (m < 0) { m = 11; y--; }
    else if (m > 11) { m = 0; y++; }
    state.calMonth = m;
    state.calYear = y;
    if (state.summary) renderCalendar(state.summary.runs);
}

function changeRunsPage(offset) {
    if (!state.summary) return;
    const total = Math.ceil(state.summary.runs.length / 10); // RUNS_PER_PAGE
    const next = Math.max(1, Math.min(total, state.runsPage + offset));
    if (next !== state.runsPage) {
        state.runsPage = next;
        renderRuns(state.summary.runs);
        ui.runsList.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

async function loadAndRenderRunDetails(runId, target) {
    const bundle = await loadRunDetailBundleWithCache(runId);
    state.detailCache.set(runId, bundle);
    const run = state.summary.runs.find(r => r.id === runId);
    renderRunDetailsContent(target, run, bundle);
}

function focusRunFromCalendar(runId) {
    const index = state.summary.runs.findIndex(r => r.id === runId);
    if (index === -1) return;
    
    const page = Math.floor(index / 10) + 1; // RUNS_PER_PAGE
    if (state.runsPage !== page) {
        state.runsPage = page;
        renderRuns(state.summary.runs);
    }
    switchTab("runs");
    
    setTimeout(() => {
        const card = document.getElementById(`run-${runId}`);
        if (card) {
            card.scrollIntoView({ behavior: "smooth", block: "center" });
            card.classList.add("highlight-flash");
            setTimeout(() => card.classList.remove("highlight-flash"), 2000);
        }
    }, 100);
}

async function generateCoachPrompt(provider) {
    if (!state.summary) return;
    ui.promptContainer.classList.remove("hidden");
    ui.coachPrompt.value = "正在整理數據...";
    
    const highlighted = state.summary.runs.slice(0, 3);
    const bundles = await Promise.all(highlighted.map(r => loadRunDetailBundleWithCache(r.id)));
    const detailMap = new Map(highlighted.map((r, i) => [r.id, bundles[i]]));
    
    const { buildCoachPrompt } = await import("./components/dashboard.js");
    ui.coachPrompt.value = buildCoachPrompt(provider, state.summary, highlighted, detailMap);
}

function handleCopyPrompt() {
    navigator.clipboard.writeText(ui.coachPrompt.value).then(() => {
        ui.copyToast.classList.remove("hidden");
        setTimeout(() => ui.copyToast.classList.add("hidden"), 1600);
    });
}

// Service Worker & PWA logic
function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch(console.warn);
    }
}

function bindInstallPrompt() {
    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        state.installPromptEvent = e;
        ui.installBanner?.classList.remove("hidden");
    });

    ui.installBtn?.addEventListener("click", () => {
        state.installPromptEvent?.prompt();
        ui.installBanner?.classList.add("hidden");
    });
}

function renderEmptyDashboard() {
    ui.monthMileage.textContent = "0.0 km";
    ui.monthCount.textContent = "0 次跑步";
    ui.weekMileage.textContent = "0.0 km";
    ui.weekCount.textContent = "0 次跑步";
    ui.recentPace.textContent = "--";
    ui.recentHr.textContent = "--";
    
    if (ui.acwrScore) ui.acwrScore.textContent = "--";
    if (ui.efficiencyScore) ui.efficiencyScore.textContent = "--";
    
    [ui.pb1k, ui.pb3k, ui.pb5k, ui.pb10k].forEach(el => { if (el) el.textContent = "--"; });
    [ui.pb1kDate, ui.pb3kDate, ui.pb5kDate, ui.pb10kDate].forEach(el => { if (el) el.textContent = "尚無資料"; });

    ui.trainingHeadline.textContent = "等待資料載入";
    ui.trainingSummary.textContent = "成功連接 Strava 後，這裡會整理你的近期負荷與分析。";
    
    ui.abilityScore.textContent = "--";
    ui.pred5k.textContent = "--";
    ui.pred10k.textContent = "--";
    ui.predHalf.textContent = "--";
    ui.predMarathon.textContent = "--";

    ui.runsCount.textContent = "0 筆";
    ui.runsList.innerHTML = '<p class="empty-state">尚未載入活動資料。</p>';
    ui.runsPagination.classList.add("hidden");
    
    if (state.weeklyChart) {
        state.weeklyChart.destroy();
        state.weeklyChart = null;
    }
}
