import { state, STORAGE_KEYS } from "../state.js";
import { setStatus } from "../ui-utils.js";
import { renderCalendar } from "../components/calendar.js";
import { renderRuns, renderRunsSkeleton } from "../components/runs-list.js";
import { renderTopStatsSkeleton, renderInsightSkeleton, renderPredictionSkeleton } from "../components/dashboard.js";
import { renderPbGallery, renderPbSkeleton } from "../components/pb-gallery.js";
import { bindSwipeGesture } from "../components/gestures.js";
import { disposeAllRunVisuals } from "../components/charts.js";

const RUNS_PER_PAGE = 10;
const TABS = ["overview", "analysis", "pbs", "runs"];
const TEXT = {
    loadingPrompt: "Generating coach prompt...",
    copySuccess: "Prompt copied to clipboard.",
    copyError: "Failed to copy prompt.",
    promptError: "Failed to generate coach prompt.",
};

export const UiController = {
    init() {
        this.bindEvents();
        this.bindSwipeNavigation();
    },

    bindEvents() {
        document.querySelectorAll(".dashboard-tab").forEach((button) => {
            button.addEventListener("click", () => this.switchTab(button.dataset.dashboardTab));
        });
        document.querySelectorAll("[data-runs-view]").forEach((button) => {
            button.addEventListener("click", () => this.setRunsViewMode(button.dataset.runsView));
        });

        document.getElementById("cal-prev-btn")?.addEventListener("click", () => this.changeCalendarMonth(-1));
        document.getElementById("cal-next-btn")?.addEventListener("click", () => this.changeCalendarMonth(1));
        document.getElementById("runs-prev-btn")?.addEventListener("click", () => this.changeRunsPage(-1));
        document.getElementById("runs-next-btn")?.addEventListener("click", () => this.changeRunsPage(1));

        document.getElementById("get-openai-btn")?.addEventListener("click", () => {
            this.generateCoachPrompt("OpenAI").catch((error) => this.handleCoachPromptError(error));
        });

        document.getElementById("get-gemini-btn")?.addEventListener("click", () => {
            this.generateCoachPrompt("Gemini").catch((error) => this.handleCoachPromptError(error));
        });

        document.getElementById("copy-btn")?.addEventListener("click", () => {
            this.handleCopyPrompt().catch((error) => {
                console.error("Copy prompt failed:", error);
                setStatus(TEXT.copyError, "error");
            });
        });

        this.syncRunsViewModeUi();
        this.registerServiceWorker();
        this.bindInstallPrompt();
    },

    async registerServiceWorker() {
        if (!("serviceWorker" in navigator)) return;
        try {
            const registration = await navigator.serviceWorker.register("./sw.js");
            this.bindServiceWorkerUpdateFlow(registration);
            registration.update().catch(() => {
                // Manual update checks are best effort.
            });
        } catch (error) {
            console.warn("Service worker registration failed:", error);
        }
    },

    bindServiceWorkerUpdateFlow(registration) {
        if (registration.waiting) this.activateWaitingWorker(registration);

        registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (!installing) return;

            installing.addEventListener("statechange", () => {
                if (installing.state === "installed" && navigator.serviceWorker.controller) {
                    this.activateWaitingWorker(registration);
                }
            });
        });

        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (sessionStorage.getItem("sw-controller-reloaded") === "1") return;
            sessionStorage.setItem("sw-controller-reloaded", "1");
            window.location.reload();
        });
    },

    activateWaitingWorker(registration) {
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    },

    bindInstallPrompt() {
        window.addEventListener("beforeinstallprompt", (event) => {
            event.preventDefault();
            state.installPromptEvent = event;
            document.getElementById("install-app-btn")?.classList.remove("hidden");
        });

        document.getElementById("install-app-btn")?.addEventListener("click", () => {
            state.installPromptEvent?.prompt();
            document.getElementById("install-app-btn")?.classList.add("hidden");
        });
    },

    switchTab(tabId) {
        if (state.dashboardTab !== tabId && "vibrate" in navigator) {
            navigator.vibrate(10);
        }

        state.dashboardTab = tabId;

        document.querySelectorAll(".dashboard-tab").forEach((button) => {
            button.classList.toggle("is-active", button.dataset.dashboardTab === tabId);
        });

        document.querySelectorAll(".dashboard-panel").forEach((panel) => {
            panel.classList.toggle("hidden", panel.dataset.dashboardPanel !== tabId);
        });

        if (tabId === "pbs" && state.summary) renderPbGallery(state.summary);
    },

    bindSwipeNavigation() {
        const dashboard = document.getElementById("dashboard");
        if (!dashboard) return;

        bindSwipeGesture(
            dashboard,
            () => {
                const index = TABS.indexOf(state.dashboardTab);
                if (index >= 0 && index < TABS.length - 1) this.switchTab(TABS[index + 1]);
            },
            () => {
                const index = TABS.indexOf(state.dashboardTab);
                if (index > 0) this.switchTab(TABS[index - 1]);
            }
        );
    },

    changeCalendarMonth(offset) {
        let month = state.calMonth + offset;
        let year = state.calYear;

        if (month < 0) {
            month = 11;
            year -= 1;
        } else if (month > 11) {
            month = 0;
            year += 1;
        }

        state.calMonth = month;
        state.calYear = year;
        if (state.summary) renderCalendar(state.summary.runs);
    },

    changeRunsPage(offset) {
        if (!state.summary) return;

        const totalPages = Math.ceil(state.summary.runs.length / RUNS_PER_PAGE);
        const nextPage = Math.max(1, Math.min(totalPages, state.runsPage + offset));
        if (nextPage === state.runsPage) return;

        state.runsPage = nextPage;
        renderRuns(state.summary.runs);
        document.getElementById("runs-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    },

    setRunsViewMode(mode) {
        const nextMode = mode === "list" ? "list" : "card";
        if (state.runsViewMode === nextMode) return;

        state.runsViewMode = nextMode;
        try {
            localStorage.setItem(STORAGE_KEYS.runsViewMode, nextMode);
        } catch (error) {
            console.warn("Failed to persist runs view mode:", error);
        }

        this.syncRunsViewModeUi();
        if (state.summary) renderRuns(state.summary.runs);
    },

    syncRunsViewModeUi() {
        document.querySelectorAll("[data-runs-view]").forEach((button) => {
            const isActive = button.dataset.runsView === state.runsViewMode;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        });
    },

    async generateCoachPrompt(provider) {
        if (!state.summary) return;

        const promptContainer = document.getElementById("prompt-container");
        const coachPrompt = document.getElementById("coach-prompt");

        promptContainer?.classList.remove("hidden");
        if (coachPrompt) coachPrompt.value = TEXT.loadingPrompt;

        const highlightedRuns = state.summary.runs.slice(0, 3);
        const { DataController } = await import("./data-controller.js");
        const bundles = await Promise.all(
            highlightedRuns.map((run) => DataController.loadRunDetailBundleWithCache(run.id))
        );

        const detailMap = new Map(highlightedRuns.map((run, index) => [run.id, bundles[index]]));
        const { buildCoachPrompt } = await import("../components/dashboard.js");
        if (coachPrompt) {
            coachPrompt.value = buildCoachPrompt(provider, state.summary, highlightedRuns, detailMap);
        }
    },

    handleCoachPromptError(error) {
        console.error("Coach prompt generation failed:", error);
        setStatus(TEXT.promptError, "error");
    },

    async handleCopyPrompt() {
        const coachPrompt = document.getElementById("coach-prompt");
        const copyToast = document.getElementById("copy-toast");
        if (!coachPrompt) return;

        await navigator.clipboard.writeText(coachPrompt.value);
        setStatus(TEXT.copySuccess, "success");
        copyToast?.classList.remove("hidden");
        setTimeout(() => copyToast?.classList.add("hidden"), 1600);
    },

    renderEmptyDashboard() {
        disposeAllRunVisuals();
        renderTopStatsSkeleton();
        renderInsightSkeleton();
        renderPredictionSkeleton();
        renderPbSkeleton();
        renderRunsSkeleton();

        const runsPagination = document.getElementById("runs-pagination");
        if (runsPagination) runsPagination.classList.add("hidden");

        if (state.weeklyChart) {
            state.weeklyChart.destroy();
            state.weeklyChart = null;
        }
    },

    updateEnrichmentProgress(completed, total) {
        const progressBanner = document.getElementById("enrichment-progress-banner");
        const progressBar = document.getElementById("enrichment-bar");
        const progressPercent = document.getElementById("enrichment-percent");

        if (progressBanner) progressBanner.classList.remove("hidden");

        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressPercent) progressPercent.textContent = `${percent}%`;
    },

    hideEnrichmentProgress() {
        const progressBanner = document.getElementById("enrichment-progress-banner");
        if (progressBanner) progressBanner.classList.add("hidden");
    },
};
