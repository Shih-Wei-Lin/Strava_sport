import { state, STORAGE_KEYS } from "../state.js";
import { renderCalendar } from "../components/calendar.js";
import { renderRuns, renderRunsSkeleton } from "../components/runs-list.js";
import { 
    renderTopStatsSkeleton, 
    renderInsightSkeleton, 
    renderPredictionSkeleton 
} from "../components/dashboard.js";

export const UiController = {
    init() {
        this.bindEvents();
    },

    bindEvents() {
        // Tabs
        document.querySelectorAll(".dashboard-tab").forEach(btn => {
            btn.addEventListener("click", () => this.switchTab(btn.dataset.dashboardTab));
        });

        // Calendar Navigation
        document.getElementById("cal-prev-btn")?.addEventListener("click", () => this.changeCalendarMonth(-1));
        document.getElementById("cal-next-btn")?.addEventListener("click", () => this.changeCalendarMonth(1));

        // Runs Pagination
        document.getElementById("runs-prev-btn")?.addEventListener("click", () => this.changeRunsPage(-1));
        document.getElementById("runs-next-btn")?.addEventListener("click", () => this.changeRunsPage(1));

        // Coach Prompts
        document.getElementById("get-openai-btn")?.addEventListener("click", () => this.generateCoachPrompt("OpenAI"));
        document.getElementById("get-gemini-btn")?.addEventListener("click", () => this.generateCoachPrompt("Gemini"));
        document.getElementById("copy-btn")?.addEventListener("click", () => this.handleCopyPrompt());

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
            document.getElementById("install-app-btn")?.classList.remove("hidden");
        });

        document.getElementById("install-app-btn")?.addEventListener("click", () => {
            state.installPromptEvent?.prompt();
            document.getElementById("install-app-btn")?.classList.add("hidden");
        });
    },

    switchTab(tabId) {
        state.dashboardTab = tabId;
        document.querySelectorAll(".dashboard-tab").forEach(btn => 
            btn.classList.toggle("is-active", btn.dataset.dashboardTab === tabId)
        );
        document.querySelectorAll(".dashboard-panel").forEach(panel => 
            panel.classList.toggle("hidden", panel.dataset.dashboardPanel !== tabId)
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
            document.getElementById("runs-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    },

    async generateCoachPrompt(provider) {
        if (!state.summary) return;
        const promptContainer = document.getElementById("prompt-container");
        const coachPrompt = document.getElementById("coach-prompt");
        
        promptContainer?.classList.remove("hidden");
        if (coachPrompt) coachPrompt.value = "正在整理數據...";
        
        const highlighted = state.summary.runs.slice(0, 3);
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
        renderTopStatsSkeleton();
        renderInsightSkeleton();
        renderPredictionSkeleton();
        renderRunsSkeleton();

        const el = {
            trainingHeadline: document.getElementById("training-headline"),
            trainingSummary: document.getElementById("training-summary"),
            runsPagination: document.getElementById("runs-pagination"),
        };

        if (el.runsPagination) el.runsPagination.classList.add("hidden");
        
        if (state.weeklyChart) {
            state.weeklyChart.destroy();
            state.weeklyChart = null;
        }
    }
};
