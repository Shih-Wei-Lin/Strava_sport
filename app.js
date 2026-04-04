import { state } from "./state.js";
import { setStatus, stripAuthParams } from "./ui-utils.js";
import { exchangeCodeForToken } from "./auth.js";

// Controllers
import { AuthController } from "./controllers/auth-controller.js";
import { DataController } from "./controllers/data-controller.js";
import { UiController } from "./controllers/ui-controller.js";

// Component renders
import { renderRuns, renderRunDetailsContent } from "./components/runs-list.js";

/**
 * Main Application Entry Point
 */

document.addEventListener("DOMContentLoaded", initApp);

async function initApp() {
    // Initialize Controllers
    UiController.init();
    AuthController.init(() => DataController.loadDashboard());
    DataController.init(AuthController, UiController);

    // Global Events that don't fit perfectly in one controller
    wireGlobalEvents();
    
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
            await DataController.loadDashboard();
        } catch (err) {
            setStatus(err.message, "error");
            stripAuthParams();
            AuthController.showAuthState();
        }
    } else {
        await DataController.loadDashboard();
    }
}

function wireGlobalEvents() {
    // Custom Component Events
    window.addEventListener("stride:focus-run", (e) => focusRunFromCalendar(e.detail.runId));
    window.addEventListener("stride:load-run-details", (e) => loadAndRenderRunDetails(e.detail.runId, e.detail.target));
    window.addEventListener("stride:download-run-json", (e) => {
        import("./export-utils.js").then(m => m.downloadRunJson(e.detail.runId, state.summary, state.detailCache));
    });
    window.addEventListener("stride:download-run-md", (e) => {
        import("./export-utils.js").then(m => m.downloadRunMd(e.detail.runId, state.summary, state.detailCache));
    });

    // Global Exports
    document.getElementById("download-all-json")?.addEventListener("click", () => {
        import("./export-utils.js").then(m => m.downloadAllRuns("json", state.summary, state.detailCache));
    });
    document.getElementById("download-all-md")?.addEventListener("click", () => {
        import("./export-utils.js").then(m => m.downloadAllRuns("md", state.summary, state.detailCache));
    });
}

async function loadAndRenderRunDetails(runId, target) {
    const bundle = await DataController.loadRunDetailBundleWithCache(runId);
    state.detailCache.set(runId, bundle);
    const run = state.summary.runs.find(r => r.id === runId);
    renderRunDetailsContent(target, run, bundle);
}

function focusRunFromCalendar(runId) {
    const index = state.summary.runs.findIndex(r => r.id === runId);
    if (index === -1) return;
    
    const RUNS_PER_PAGE = 10;
    const page = Math.floor(index / RUNS_PER_PAGE) + 1;
    if (state.runsPage !== page) {
        state.runsPage = page;
        renderRuns(state.summary.runs);
    }
    UiController.switchTab("runs");
    
    setTimeout(() => {
        const card = document.getElementById(`run-${runId}`);
        if (card) {
            card.scrollIntoView({ behavior: "smooth", block: "center" });
            card.classList.add("highlight-flash");
            setTimeout(() => card.classList.remove("highlight-flash"), 2000);
        }
    }, 100);
}
