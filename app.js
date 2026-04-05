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

/**
 * Initialize application controllers, OAuth callback handling, and initial dashboard load.
 *
 * Parameters:
 * - None.
 *
 * Returns:
 * - {Promise<void>}: Resolves when the first dashboard loading flow is completed.
 *
 * Raises:
 * - {Error}: Propagates unexpected initialization errors from controller setup or data loading.
 */
async function initApp() {
    try {
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
    } catch (error) {
        console.error("Application initialization failed:", error);
        const message = error instanceof Error ? error.message : "Unknown startup error";
        setStatus(`初始化失敗：${message}`, "error");
        AuthController.showAuthState();
    }
}

/**
 * Bind global custom events and export actions that coordinate multiple modules.
 *
 * Parameters:
 * - None.
 *
 * Returns:
 * - {void}: This function does not return a value.
 *
 * Raises:
 * - None.
 */
function wireGlobalEvents() {
    // Custom Component Events
    window.addEventListener("stride:focus-run", (e) => focusRunFromCalendar(e.detail.runId));
    window.addEventListener("stride:load-run-details", (e) => {
        loadAndRenderRunDetails(e.detail.runId, e.detail.target).catch((error) => {
            console.error("Failed to load run details:", error);
            if (e.detail.target) {
                e.detail.target.innerHTML = `<p class="detail-copy status-error">載入失敗：${error.message}</p>`;
            }
        });
    });
    window.addEventListener("stride:download-run-json", (e) => {
        import("./export-utils.js").then(m => m.downloadRunJson(e.detail.runId, state.summary, state.detailCache));
    });
    window.addEventListener("stride:download-run-md", (e) => {
        import("./export-utils.js").then(m => m.downloadRunMd(e.detail.runId, state.summary, state.detailCache));
    });

    // Global Exports
    const downloadAllJsonBtn = getFirstById("download-all-json-btn", "download-all-json");
    downloadAllJsonBtn?.addEventListener("click", () => {
        import("./export-utils.js").then(m => m.downloadAllRuns("json", state.summary, state.detailCache));
    });
    const downloadAllMdBtn = getFirstById("download-all-md-btn", "download-all-md");
    downloadAllMdBtn?.addEventListener("click", () => {
        import("./export-utils.js").then(m => m.downloadAllRuns("md", state.summary, state.detailCache));
    });
}

/**
 * Resolve the first existing DOM element by checking a list of candidate ids.
 *
 * Parameters:
 * - ids {...string}: Candidate element ids in lookup order.
 *
 * Returns:
 * - {HTMLElement|null}: The first matched element, or `null` when none exist.
 *
 * Raises:
 * - None.
 */
function getFirstById(...ids) {
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el) return el;
    }
    return null;
}

/**
 * Load a run detail bundle and render the details panel content.
 *
 * Parameters:
 * - runId {number|string}: Target run id used to fetch details.
 * - target {HTMLElement}: Target container for rendered detail content.
 *
 * Returns:
 * - {Promise<void>}: Resolves when detail content has been rendered.
 *
 * Raises:
 * - {Error}: Throws when the detail bundle cannot be loaded.
 */
async function loadAndRenderRunDetails(runId, target) {
    const bundle = await DataController.loadRunDetailBundleWithCache(runId);
    state.detailCache.set(runId, bundle);
    const run = state.summary.runs.find(r => r.id === runId);
    if (!run) {
        throw new Error(`找不到活動資料 (ID: ${runId})`);
    }
    renderRunDetailsContent(target, run, bundle);
}

/**
 * Focus a run card from calendar selection, including pagination switching and highlight animation.
 *
 * Parameters:
 * - runId {number|string}: Selected run id from calendar interaction.
 *
 * Returns:
 * - {void}: This function does not return a value.
 *
 * Raises:
 * - None.
 */
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
