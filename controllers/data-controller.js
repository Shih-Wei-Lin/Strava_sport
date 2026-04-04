import { state, STORAGE_KEYS, APP_DB_STORES } from "../state.js";
import { ensureValidToken, getCredentials } from "../auth.js";
import { fetchRunActivities, fetchAthleteZones, fetchRunDetailBundle } from "../api.js";
import { readDbRecord, writeDbRecord } from "../db.js";
import { 
    summariseActivities, 
    mergeBestEffort, 
    buildAbilityPrediction 
} from "../analytics.js";
import { setStatus, clearStatus } from "../ui-utils.js";

// Component renders
import { renderCalendar, syncHeatmapModeUi } from "../components/calendar.js";
import { renderRuns } from "../components/runs-list.js";
import { renderWeeklyChart } from "../components/charts.js";
import { renderTopStats, renderInsight, renderPrediction } from "../components/dashboard.js";
import { renderPbGallery } from "../components/pb-gallery.js";

export const DataController = {
    init(authController, uiController) {
        this.authController = authController;
        this.uiController = uiController;
        this.bindEvents();
    },

    bindEvents() {
        document.getElementById("refresh-data")?.addEventListener("click", () => this.loadDashboard());
    },

    async loadDashboard() {
        const refreshBtn = document.getElementById("refresh-data");
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.textContent = "正在載入數據...";
        }

        const token = await ensureValidToken();
        if (!token) {
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.textContent = "重新整理";
            }
            const { clientId } = getCredentials();
            if (!clientId) this.authController.showSetupState();
            else this.authController.showAuthState();
            return;
        }

        this.authController.showDashboardState();
        clearStatus();
        this.uiController.renderEmptyDashboard();
        
        try {
            const [activities, athleteZones] = await Promise.all([
                fetchRunActivities(token),
                fetchAthleteZones(token),
            ]);
            
            state.athleteZones = athleteZones;
            state.summary = summariseActivities(activities, new Date());
            
            this.renderAppLayout(state.summary);

            const athleteName = localStorage.getItem(STORAGE_KEYS.athleteName);
            const prefix = athleteName ? `${athleteName}，` : "";
            setStatus(`${prefix}已載入 ${state.summary.runs.length} 筆活動。`, "success");

            // Start background enrichment
            state.enrichmentRunId++;
            this.enrichPerformanceInsights(state.enrichmentRunId);
        } catch (err) {
            console.error(err);
            this.authController.showAuthState();
            setStatus(`載入載入失敗：${err.message}`, "error");
        } finally {
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.textContent = "重新整理";
            }
        }
    },

    renderAppLayout(summary) {
        state.runsPage = 1;
        renderTopStats(summary);
        renderInsight(summary);
        renderPrediction(summary);
        renderPbGallery(summary.runs);
        renderWeeklyChart(summary.weeklyTrend);
        renderCalendar(summary.runs);
        renderRuns(summary.runs);
        syncHeatmapModeUi();
    },

    async enrichPerformanceInsights(id) {
        if (!state.summary) return;
        
        const token = await ensureValidToken();
        if (!token) return;

        // Recently 40 runs within 180 days
        const recent = state.summary.runs
            .filter(r => r.distanceKm >= 1 && r.startedAt >= new Date(Date.now() - 180 * 24 * 60 * 60 * 1000))
            .slice(0, 40);

        if (recent.length === 0) return;

        // Terminate existing worker if any
        if (state.enrichmentWorker) {
            state.enrichmentWorker.terminate();
            state.enrichmentWorker = null;
        }

        setStatus(`正在深度分析最近 ${recent.length} 筆活動的區段表現...`, "info");

        const worker = new Worker('./workers/enrichment.js', { type: 'module' });
        state.enrichmentWorker = worker;

        worker.onmessage = (e) => {
            if (id !== state.enrichmentRunId) {
                worker.terminate();
                if (state.enrichmentWorker === worker) state.enrichmentWorker = null;
                return;
            }

            const { type, batch, completed, total } = e.data;

            if (type === "progress") {
                batch.forEach(result => {
                    if (result.bests) {
                        Object.keys(result.bests).forEach(key => {
                            state.summary.bests[key] = mergeBestEffort(state.summary.bests[key], result.bests[key]);
                        });
                    }
                });
                
                setStatus(`正在分析區段表現 (${completed}/${total})...`, "info");
                this.updatePredictionAndStats();
            } else if (type === "complete") {
                setStatus("區段分析完成，預測已更新。", "success");
                worker.terminate();
                if (state.enrichmentWorker === worker) state.enrichmentWorker = null;
            }
        };

        worker.onerror = (err) => {
            console.error("Enrichment worker error:", err);
            setStatus("區段分析過程中發生錯誤。", "error");
            worker.terminate();
            if (state.enrichmentWorker === worker) state.enrichmentWorker = null;
        };

        worker.postMessage({ recent, token });
    },

    async loadRunDetailBundleWithCache(runId) {
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
    },

    updatePredictionAndStats() {
        state.summary.prediction = this.buildAbilityPredictionFromSummary(state.summary);
        renderTopStats(state.summary);
        renderPrediction(state.summary);
        renderPbGallery(state.summary.runs);
    },

    buildAbilityPredictionFromSummary(summary) {
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
};
