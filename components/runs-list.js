import { state, ui, RUNS_PER_PAGE } from "../state.js";
import { escapeHtml } from "../utils.js";
import {
    formatDistance,
    formatDuration,
    formatPaceFromSeconds,
    formatPaceFromSpeed,
    buildHeartRateZoneSummary,
    formatCompactDuration,
} from "../analytics.js";

/**
 * Render the list of runs based on the current state.
 * @param {Array} runs - Normalized run activities.
 */
export function renderRuns(runs) {
    if (!ui.runsList || !ui.runsPagination) return;

    ui.runsCount.textContent = `${runs.length} 筆`;

    if (runs.length === 0) {
        ui.runsList.innerHTML = '<p class="empty-state">目前沒有任何跑步活動。</p>';
        ui.runsPagination.classList.add("hidden");
        return;
    }

    const totalPages = Math.ceil(runs.length / RUNS_PER_PAGE);
    const start = (state.runsPage - 1) * RUNS_PER_PAGE;
    const pageRuns = runs.slice(start, start + RUNS_PER_PAGE);

    const html = pageRuns.map((run) => createRunCardHtml(run)).join("");
    ui.runsList.innerHTML = html;

    ui.runsPagination.classList.toggle("hidden", totalPages <= 1);
    ui.runsPageInfo.textContent = `第 ${state.runsPage} / ${totalPages} 頁`;
    ui.runsPrevBtn.disabled = state.runsPage <= 1;
    ui.runsNextBtn.disabled = state.runsPage >= totalPages;

    // Attach expand listeners
    ui.runsList.querySelectorAll(".btn-expand").forEach((btn) => {
        btn.addEventListener("click", () => toggleRunDetails(btn.dataset.id));
    });
}

function createRunCardHtml(run) {
    const badge = run.distanceKm >= 21.1 ? "半馬級別" : run.distanceKm >= 10 ? "長跑" : "一般跑步";
    
    return `
        <article id="run-${run.id}" class="run-card">
            <div class="run-header">
                <div>
                    <h3 class="run-title">${escapeHtml(run.name)}</h3>
                    <p class="run-date">${run.dateLabel}</p>
                </div>
                <span class="run-badge">${badge}</span>
            </div>
            <div class="run-metrics">
                <div class="metric-box"><span class="metric-label">距離</span><strong class="metric-value">${run.distanceKm.toFixed(2)} km</strong></div>
                <div class="metric-box"><span class="metric-label">配速</span><strong class="metric-value">${run.averagePaceLabel}</strong></div>
                <div class="metric-box"><span class="metric-label">時間</span><strong class="metric-value">${run.movingTimeLabel}</strong></div>
                <div class="metric-box"><span class="metric-label">心率</span><strong class="metric-value">${run.averageHeartrate ? Math.round(run.averageHeartrate) : "--"} bpm</strong></div>
            </div>
            <div class="run-actions">
                <button class="btn btn-ghost btn-sm btn-expand" data-id="${run.id}">詳細分析</button>
                <a href="https://www.strava.com/activities/${run.id}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">開啟 Strava</a>
            </div>
            <div id="run-details-${run.id}" class="run-details hidden"></div>
        </article>
    `;
}

export async function toggleRunDetails(runId) {
    const detailsEl = document.getElementById(`run-details-${runId}`);
    if (!detailsEl) return;

    const isHidden = detailsEl.classList.contains("hidden");
    if (!isHidden) {
        detailsEl.classList.add("hidden");
        return;
    }

    // Show loading state
    detailsEl.classList.remove("hidden");
    detailsEl.innerHTML = '<p class="detail-copy">正在載入分析數據與區段細節...</p>';

    try {
        // Dispatch event to app.js to handle data fetching (and caching)
        const event = new CustomEvent("stride:load-run-details", {
            detail: { runId, target: detailsEl }
        });
        window.dispatchEvent(event);
    } catch (error) {
        detailsEl.innerHTML = `<p class="detail-copy status-error">載入失敗：${error.message}</p>`;
    }
}

export function renderRunDetailsContent(container, run, bundle) {
    const { detail, streams } = bundle;
    const hrSummary = buildHeartRateZoneSummary(streams, state.athleteZones);
    
    let hrHtml = "";
    if (hrSummary) {
        const zonesHtml = hrSummary.zones.map(z => `
            <div class="insight-chip">
                <span>${z.label}</span>
                <strong>${formatCompactDuration(z.timeSec)} (${z.percent}%)</strong>
            </div>
        `).join("");
        hrHtml = `
            <div class="detail-card">
                <p class="detail-title">心率區間分佈</p>
                <div class="chip-grid compact-chip-grid">${zonesHtml}</div>
            </div>
        `;
    }

    const splits = detail.splits_metric || [];
    const splitsHtml = splits.length > 0 ? `
        <div class="detail-card">
            <p class="detail-title">每公里拆分 (Splits)</p>
            <div class="splits-table-container">
                <table class="splits-table">
                    <thead>
                        <tr><th>公里</th><th>配速</th><th>爬升</th><th>心率</th></tr>
                    </thead>
                    <tbody>
                        ${splits.map(s => `
                            <tr>
                                <td>${s.split}</td>
                                <td>${formatPaceFromSpeed(s.average_speed)}</td>
                                <td>${Math.round(s.elevation_difference)}m</td>
                                <td>${s.average_heartrate ? Math.round(s.average_heartrate) : "--"}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        </div>
    ` : "";

    container.innerHTML = `
        <div class="run-details-grid">
            <div class="detail-card">
                <p class="detail-title">訓練負荷與爬升</p>
                <p class="detail-copy">
                    總爬升：${Math.round(run.totalElevationGain)}m · 
                    最大坡度：${detail.max_watts ? `${detail.max_watts}W (估計)` : "--"} · 
                    卡路里：${detail.calories ? Math.round(detail.calories) : "--"} kcal
                </p>
            </div>
            ${hrHtml}
            ${splitsHtml}
        </div>
        <div class="run-actions" style="margin-top: 1rem;">
             <button class="btn btn-primary btn-sm btn-download-json" data-id="${run.id}">匯出 JSON</button>
        </div>
    `;

    // Attach actions
    container.querySelector(".btn-download-json")?.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("stride:download-run-json", { detail: { runId } }));
    });
}
