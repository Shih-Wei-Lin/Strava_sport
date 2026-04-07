import { state, STORAGE_KEYS, APP_DB_STORES } from "../state.js";
import { ensureValidToken, getCredentials } from "../auth.js";
import { fetchRunActivities, fetchAthleteZones, fetchRunDetailBundle } from "../api.js";
import { readDbRecord, writeDbRecord } from "../db.js";
import { summariseActivities, mergeBestEffort, buildAbilityPrediction } from "../analytics.js";
import { setStatus, clearStatus, getByIds, bindButtonActivation } from "../ui-utils.js";

import { renderCalendar, syncHeatmapModeUi } from "../components/calendar.js";
import { bindPullToRefreshGesture } from "../components/gestures.js";
import { renderRuns } from "../components/runs-list.js";
import { renderWeeklyChart } from "../components/charts.js";
import { renderTopStats, renderInsight, renderPrediction } from "../components/dashboard.js";
import { renderPbGallery } from "../components/pb-gallery.js";

const TEXT = {
    refreshLoading: "Refreshing...",
    refreshIdle: "Refresh Data",
    loadedSuccess: (name, count) => {
        const prefix = name ? `${name}: ` : "";
        return `${prefix}Loaded ${count} run activities.`;
    },
    enrichmentStart: (count) => `Enriching insights from ${count} recent runs...`,
    enrichmentDone: "Insight enrichment complete.",
    enrichmentError: "Insight enrichment failed. See console for details.",
};

const ENRICHMENT_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000;
const ENRICHMENT_MAX_RUNS = 40;
const PREDICTION_MAX_RECENT_RUNS = 16;

function isAuthFailureError(error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return /(token|auth|unauthorized|401|403)/i.test(message);
}

function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

export const DataController = {
    init(authController, uiController) {
        this.authController = authController;
        this.uiController = uiController;
        this.bindEvents();
    },

    bindEvents() {
        bindButtonActivation(getByIds("refresh-data", "refresh-data-btn"), () => this.loadDashboard());
        this.bindPullToRefresh();
    },

    bindPullToRefresh() {
        const indicator = document.getElementById("pull-refresh-indicator");
        if (!indicator) return;
        bindPullToRefreshGesture(indicator, () => this.loadDashboard());
    },

    setRefreshButtonState(isLoading) {
        const refreshBtn = getByIds("refresh-data", "refresh-data-btn");
        if (!refreshBtn) return;
        refreshBtn.disabled = isLoading;
        refreshBtn.textContent = isLoading ? TEXT.refreshLoading : TEXT.refreshIdle;
    },

    handleMissingToken() {
        const { clientId } = getCredentials();
        if (!clientId) this.authController.showSetupState();
        else this.authController.showAuthState();
    },

    handleDashboardLoadError(error) {
        const message = getErrorMessage(error);
        setStatus(`Failed to refresh dashboard: ${message}`, "error");
        if (isAuthFailureError(error)) this.authController.showAuthState();
        else this.authController.showDashboardState();
    },

    async loadDashboard() {
        this.setRefreshButtonState(true);
        try {
            const token = await ensureValidToken();
            if (!token) {
                this.handleMissingToken();
                return;
            }

            this.authController.showDashboardState();
            clearStatus();
            this.uiController.renderEmptyDashboard();

            const [activities, athleteZones] = await Promise.all([
                fetchRunActivities(token),
                fetchAthleteZones(token),
            ]);

            state.athleteZones = athleteZones;
            state.summary = summariseActivities(activities, new Date());
            this.renderAppLayout(state.summary);

            const athleteName = localStorage.getItem(STORAGE_KEYS.athleteName);
            setStatus(TEXT.loadedSuccess(athleteName, state.summary.runs.length), "success");

            if ("vibrate" in navigator) navigator.vibrate([20, 10, 20]);

            state.enrichmentRunId += 1;
            this.enrichPerformanceInsights(state.enrichmentRunId);
        } catch (error) {
            console.error("Dashboard load failed:", error);
            this.handleDashboardLoadError(error);
        } finally {
            this.setRefreshButtonState(false);
        }
    },

    renderAppLayout(summary) {
        state.runsPage = 1;
        renderTopStats(summary);
        renderInsight(summary);
        renderPrediction(summary);
        renderPbGallery(summary);
        renderWeeklyChart(summary.weeklyTrend);
        renderCalendar(summary.runs);
        renderRuns(summary.runs);
        syncHeatmapModeUi();
    },

    stopActiveEnrichmentWorker() {
        if (!state.enrichmentWorker) return;
        state.enrichmentWorker.terminate();
        state.enrichmentWorker = null;
    },

    getRecentRunsForEnrichment(summary) {
        const cutoff = new Date(Date.now() - ENRICHMENT_LOOKBACK_MS);
        return summary.runs
            .filter((run) => run.distanceKm >= 1 && run.startedAt >= cutoff)
            .slice(0, ENRICHMENT_MAX_RUNS);
    },

    applyEnrichmentBatch(batch) {
        for (const result of batch) {
            if (!result?.bests) continue;
            for (const key of Object.keys(result.bests)) {
                state.summary.bests[key] = mergeBestEffort(state.summary.bests[key], result.bests[key]);
            }
        }
        this.updatePredictionAndStats();
    },

    async enrichPerformanceInsights(id) {
        if (!state.summary) return;

        const token = await ensureValidToken();
        if (!token) return;

        const recentRuns = this.getRecentRunsForEnrichment(state.summary);
        if (recentRuns.length === 0) return;

        this.stopActiveEnrichmentWorker();
        setStatus(TEXT.enrichmentStart(recentRuns.length), "info");

        const worker = new Worker("./workers/enrichment.js", { type: "module" });
        state.enrichmentWorker = worker;

        worker.onmessage = (event) => {
            if (id !== state.enrichmentRunId || state.enrichmentWorker !== worker) {
                worker.terminate();
                return;
            }

            const { type, batch, completed, total } = event.data;
            if (type === "progress") {
                this.uiController.updateEnrichmentProgress(completed, total);
                this.applyEnrichmentBatch(batch);
                return;
            }

            if (type === "complete") {
                setStatus(TEXT.enrichmentDone, "success");
                this.uiController.hideEnrichmentProgress();
                this.stopActiveEnrichmentWorker();
            }
        };

        worker.onerror = (error) => {
            console.error("Enrichment worker error:", error);
            setStatus(TEXT.enrichmentError, "error");
            this.uiController.hideEnrichmentProgress();
            this.stopActiveEnrichmentWorker();
        };

        worker.postMessage({ recent: recentRuns, token });
    },

    async loadRunDetailBundleWithCache(runId) {
        const cached = await readDbRecord(APP_DB_STORES.bundles, runId);
        if (cached) return cached.bundle;

        const token = await ensureValidToken();
        if (!token) {
            throw new Error("Cannot load run detail bundle without a valid token.");
        }

        const bundle = await fetchRunDetailBundle(token, runId);
        await writeDbRecord(APP_DB_STORES.bundles, {
            runId,
            savedAt: new Date().toISOString(),
            bundle,
        });
        return bundle;
    },

    updatePredictionAndStats() {
        state.summary.prediction = this.buildAbilityPredictionFromSummary(state.summary);
        renderTopStats(state.summary);
        renderPrediction(state.summary);
        renderPbGallery(state.summary);
    },

    buildAbilityPredictionFromSummary(summary) {
        const cutoff = new Date(Date.now() - ENRICHMENT_LOOKBACK_MS);
        const recent = summary.runs
            .filter((run) => run.startedAt >= cutoff)
            .filter((run) => run.distanceKm >= 3 && run.distanceKm <= 21.1)
            .slice(0, PREDICTION_MAX_RECENT_RUNS);

        return buildAbilityPrediction([
            summary.bests.segment5k,
            summary.bests.segment10k,
            summary.bests.segment3k,
            summary.bests.fullRun3k,
            summary.bests.fullRun5k,
            summary.bests.fullRun10k,
            ...recent,
        ]);
    },
};
