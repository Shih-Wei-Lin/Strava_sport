import { state, STORAGE_KEYS } from "../state.js";
import { renderCalendar } from "../components/calendar.js";
import { renderRuns } from "../components/runs-list.js";

export const UiController = {
    init() {
        this.bindEvents();
    },

    bindEvents() {
        // Tabs
        document.querySelectorAll(".nav-tab").forEach(btn => {
            btn.addEventListener("click", () => this.switchTab(btn.dataset.tab));
        });

        // Calendar Navigation
        document.getElementById("cal-prev")?.addEventListener("click", () => this.changeCalendarMonth(-1));
        document.getElementById("cal-next")?.addEventListener("click", () => this.changeCalendarMonth(1));

        // Runs Pagination
        document.getElementById("runs-prev")?.addEventListener("click", () => this.changeRunsPage(-1));
        document.getElementById("runs-next")?.addEventListener("click", () => this.changeRunsPage(1));

        // Coach Prompts
        document.querySelectorAll(".btn-coach").forEach(btn => {
            btn.addEventListener("click", () => this.generateCoachPrompt(btn.dataset.provider));
        });
        document.getElementById("copy-prompt")?.addEventListener("click", () => this.handleCopyPrompt());

        this.registerServiceWorker();
        this.bindInstallPrompt();
    },

    registerServiceWorker() {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("./sw.js").catch(console.warn);
        }
    },

    bindInstallPrompt() {
        window.addEventListener("beforeinstallprompt", (e) => {
            e.preventDefault();
            state.installPromptEvent = e;
            document.getElementById("install-banner")?.classList.remove("hidden");
        });

        document.getElementById("install-btn")?.addEventListener("click", () => {
            state.installPromptEvent?.prompt();
            document.getElementById("install-banner")?.classList.add("hidden");
        });
    },

    switchTab(tabId) {
        state.dashboardTab = tabId;
        document.querySelectorAll(".nav-tab").forEach(btn => 
            btn.classList.toggle("is-active", btn.dataset.tab === tabId)
        );
        document.querySelectorAll(".tab-panel").forEach(panel => 
            panel.classList.toggle("hidden", panel.id !== `tab-${tabId}`)
        );
    },

    changeCalendarMonth(offset) {
        let m = state.calMonth + offset;
        let y = state.calYear;
        if (m < 0) { m = 11; y--; }
        else if (m > 11) { m = 0; y++; }
        state.calMonth = m;
        state.calYear = y;
        if (state.summary) renderCalendar(state.summary.runs);
    },

    changeRunsPage(offset) {
        if (!state.summary) return;
        const RUNS_PER_PAGE = 10;
        const total = Math.ceil(state.summary.runs.length / RUNS_PER_PAGE);
        const next = Math.max(1, Math.min(total, state.runsPage + offset));
        if (next !== state.runsPage) {
            state.runsPage = next;
            renderRuns(state.summary.runs);
            document.getElementById("runs-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    },

    async generateCoachPrompt(provider) {
        if (!state.summary) return;
        const promptContainer = document.getElementById("prompt-container");
        const coachPrompt = document.getElementById("coach-prompt");
        
        promptContainer?.classList.remove("hidden");
        if (coachPrompt) coachPrompt.value = "正在整理數據...";
        
        const highlighted = state.summary.runs.slice(0, 3);
        // We need loadRunDetailBundleWithCache which is currently in app.js
        // For now, let's assume it's available or we'll move it to DataController
        const { DataController } = await import("./data-controller.js");
        const bundles = await Promise.all(highlighted.map(r => DataController.loadRunDetailBundleWithCache(r.id)));
        const detailMap = new Map(highlighted.map((r, i) => [r.id, bundles[i]]));
        
        const { buildCoachPrompt } = await import("../components/dashboard.js");
        if (coachPrompt) coachPrompt.value = buildCoachPrompt(provider, state.summary, highlighted, detailMap);
    },

    handleCopyPrompt() {
        const coachPrompt = document.getElementById("coach-prompt");
        const copyToast = document.getElementById("copy-toast");
        if (!coachPrompt) return;

        navigator.clipboard.writeText(coachPrompt.value).then(() => {
            copyToast?.classList.remove("hidden");
            setTimeout(() => copyToast?.classList.add("hidden"), 1600);
        });
    },

    renderEmptyDashboard() {
        const el = {
            monthMileage: document.getElementById("month-mileage"),
            monthCount: document.getElementById("month-count"),
            weekMileage: document.getElementById("week-mileage"),
            weekCount: document.getElementById("week-count"),
            recentPace: document.getElementById("recent-pace"),
            recentHr: document.getElementById("recent-hr"),
            acwrScore: document.getElementById("acwr-score"),
            efficiencyScore: document.getElementById("efficiency-score"),
            trainingHeadline: document.getElementById("training-headline"),
            trainingSummary: document.getElementById("training-summary"),
            abilityScore: document.getElementById("ability-score"),
            pred5k: document.getElementById("pred-5k"),
            pred10k: document.getElementById("pred-10k"),
            predHalf: document.getElementById("pred-half"),
            predMarathon: document.getElementById("pred-marathon"),
            runsCount: document.getElementById("runs-count"),
            runsList: document.getElementById("runs-list"),
            runsPagination: document.getElementById("runs-pagination"),
            pb1k: document.getElementById("pb-1k"),
            pb3k: document.getElementById("pb-3k"),
            pb5k: document.getElementById("pb-5k"),
            pb10k: document.getElementById("pb-10k"),
            pb1kDate: document.getElementById("pb-1k-date"),
            pb3kDate: document.getElementById("pb-3k-date"),
            pb5kDate: document.getElementById("pb-5k-date"),
            pb10kDate: document.getElementById("pb-10k-date"),
        };

        if (el.monthMileage) el.monthMileage.textContent = "0.0 km";
        if (el.monthCount) el.monthCount.textContent = "0 次跑步";
        if (el.weekMileage) el.weekMileage.textContent = "0.0 km";
        if (el.weekCount) el.weekCount.textContent = "0 次跑步";
        if (el.recentPace) el.recentPace.textContent = "--";
        if (el.recentHr) el.recentHr.textContent = "--";
        
        if (el.acwrScore) el.acwrScore.textContent = "--";
        if (el.efficiencyScore) el.efficiencyScore.textContent = "--";
        
        [el.pb1k, el.pb3k, el.pb5k, el.pb10k].forEach(node => { if (node) node.textContent = "--"; });
        [el.pb1kDate, el.pb3kDate, el.pb5kDate, el.pb10kDate].forEach(node => { if (node) node.textContent = "尚無資料"; });

        if (el.trainingHeadline) el.trainingHeadline.textContent = "等待資料載入";
        if (el.trainingSummary) el.trainingSummary.textContent = "成功連接 Strava 後，這裡會整理你的近期負荷與分析。";
        
        if (el.abilityScore) el.abilityScore.textContent = "--";
        if (el.pred5k) el.pred5k.textContent = "--";
        if (el.pred10k) el.pred10k.textContent = "--";
        if (el.predHalf) el.predHalf.textContent = "--";
        if (el.predMarathon) el.predMarathon.textContent = "--";

        if (el.runsCount) el.runsCount.textContent = "0 筆";
        if (el.runsList) el.runsList.innerHTML = '<p class="empty-state">尚未載入活動資料。</p>';
        if (el.runsPagination) el.runsPagination.classList.add("hidden");
        
        if (state.weeklyChart) {
            state.weeklyChart.destroy();
            state.weeklyChart = null;
        }
    }
};
