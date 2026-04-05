import { state, RUNS_PER_PAGE } from "../state.js";
import {
    formatDistance,
    formatDuration,
    formatPaceFromSeconds,
    formatPaceFromSpeed,
    buildHeartRateZoneSummary,
    formatCompactDuration,
    escapeHtml,
    detectIntervals,
    analyzeWeatherImpact,
} from "../analytics.js";

import { renderActivityDetailCharts } from "./charts.js";

/**
 * Render the run cards and pagination controls for the current page.
 *
 * Parameters:
 * - runs {Array<object>}: Summarized run records to be rendered.
 *
 * Returns:
 * - {void}: This function does not return a value.
 *
 * Raises:
 * - None.
 */
export function renderRuns(runs) {
    const el = {
        runsList: document.getElementById("runs-list"),
        runsPagination: document.getElementById("runs-pagination"),
        runsCount: document.getElementById("runs-count"),
        runsPageInfo: document.getElementById("runs-page-info"),
        runsPrevBtn: document.getElementById("runs-prev-btn"),
        runsNextBtn: document.getElementById("runs-next-btn"),
    };

    if (!el.runsList || !el.runsPagination) return;

    if (el.runsCount) el.runsCount.textContent = `${runs.length} 筆`;

    if (runs.length === 0) {
        el.runsList.innerHTML = '<p class="empty-state">目前沒有任何跑步活動。</p>';
        el.runsPagination.classList.add("hidden");
        return;
    }

    const totalPages = Math.ceil(runs.length / RUNS_PER_PAGE);
    const start = (state.runsPage - 1) * RUNS_PER_PAGE;
    const pageRuns = runs.slice(start, start + RUNS_PER_PAGE);

    const html = pageRuns.map((run) => createRunCardHtml(run)).join("");
    el.runsList.innerHTML = html;

    el.runsPagination.classList.toggle("hidden", totalPages <= 1);
    if (el.runsPageInfo) el.runsPageInfo.textContent = `第 ${state.runsPage} / ${totalPages} 頁`;
    if (el.runsPrevBtn) el.runsPrevBtn.disabled = state.runsPage <= 1;
    if (el.runsNextBtn) el.runsNextBtn.disabled = state.runsPage >= totalPages;

    // Attach card-level listeners
    el.runsList.querySelectorAll(".run-card").forEach((card) => {
        card.addEventListener("click", (e) => {
            const runId = card.id.replace("run-", "");
            
            // 1. IF click is on a button or link, handle logic but don't toggle
            const actionBtn = e.target.closest("button, a");
            if (actionBtn) {
                if (actionBtn.classList.contains("btn-download-json")) {
                    window.dispatchEvent(new CustomEvent("stride:download-run-json", { detail: { runId } }));
                } else if (actionBtn.classList.contains("btn-download-md")) {
                    window.dispatchEvent(new CustomEvent("stride:download-run-md", { detail: { runId } }));
                } else if (actionBtn.classList.contains("btn-expand")) {
                    toggleRunDetails(runId);
                }
                return;
            }

            // 2. IF click is inside the detail analysis content, don't toggle (prevents chart click closing)
            if (e.target.closest(".run-details")) {
                return;
            }

            // 3. Otherwise, toggle detail view
            toggleRunDetails(runId);
        });
    });
}

/**
 * Render skeleton placeholders for the runs list.
 */
export function renderRunsSkeleton() {
    const runsList = document.getElementById("runs-list");
    if (!runsList) return;

    const skeletonCard = `
        <article class="run-card skeleton-card">
            <div class="run-header">
                <div>
                     <div class="skeleton" style="width: 140px; height: 1.2rem; margin-bottom: 0.5rem;"></div>
                     <div class="skeleton" style="width: 80px; height: 0.8rem;"></div>
                </div>
            </div>
            <div class="run-metrics">
                <div class="metric-box"><div class="skeleton" style="width: 100%;"></div></div>
                <div class="metric-box"><div class="skeleton" style="width: 100%;"></div></div>
                <div class="metric-box"><div class="skeleton" style="width: 100%;"></div></div>
                <div class="metric-box"><div class="skeleton" style="width: 100%;"></div></div>
            </div>
        </article>
    `;
    
    runsList.innerHTML = new Array(3).fill(skeletonCard).join("");
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
                <button class="btn btn-primary btn-sm btn-expand" data-id="${run.id}">詳細分析</button>
                <button class="btn btn-ghost btn-sm btn-download-json" data-id="${run.id}">JSON</button>
                <button class="btn btn-ghost btn-sm btn-download-md" data-id="${run.id}">MD</button>
                <a href="https://www.strava.com/activities/${run.id}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">Strava</a>
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

/**
 * Render the expanded run details panel using fetched detail and stream bundle data.
 *
 * Parameters:
 * - container {HTMLElement}: Destination element for run details markup.
 * - run {object}: Summary object for the selected run card.
 * - bundle {object}: Detailed activity payload that includes `detail` and `streams`.
 *
 * Returns:
 * - {void}: This function does not return a value.
 */
export function renderRunDetailsContent(container, run, bundle) {
    const { detail, streams } = bundle;
    const hrSummary = buildHeartRateZoneSummary(streams, detail, state.athleteZones);
    
    let weatherHtml = "";
    let intervalsHtml = "";

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

    // Calculate max display
    const maxGrade = detail.max_grade ? `${detail.max_grade}%` : "--";
    const maxWatts = detail.max_watts ? `${Math.round(detail.max_watts)}W` : "--";

    container.innerHTML = `
        <div class="run-details-grid">
            <div class="detail-card full-width">
                <p class="detail-title">性能趨勢 (左軸：配速 / 右軸：心率)</p>
                <div class="chart-container" style="height: 200px;">
                    <canvas id="run-perf-chart-${run.id}"></canvas>
                </div>
            </div>

            <div class="detail-card full-width">
                <p class="detail-title">海拔高度 (左軸：高度趨勢)</p>
                <div class="chart-container" style="height: 180px;">
                    <canvas id="run-elev-chart-${run.id}"></canvas>
                </div>
            </div>

            <div class="detail-card">
                <p class="detail-title">心率區間分佈</p>
                <div class="chart-container" style="height: 180px;">
                    <canvas id="hr-zones-chart-${run.id}"></canvas>
                </div>
            </div>

            <div class="detail-card">
                <p class="detail-title">數據摘要</p>
                <p class="detail-copy">
                    總爬升：${Math.round(run.elevationGain || 0)}m · 
                    最大坡度：${maxGrade} · 
                    最大功率：${maxWatts} · 
                    卡路里：${detail.calories ? Math.round(detail.calories) : "--"} kcal
                </p>
            </div>

            ${weatherHtml || ""}
            ${intervalsHtml || ""}
            ${splitsHtml}
        </div>
    `;

    // Trigger chart rendering after a short delay to ensure canvas is ready
    setTimeout(() => {
        renderActivityDetailCharts(run.id, bundle, hrSummary);
    }, 60);
}

