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

import { renderActivityDetailCharts, resizeRunVisuals, disposeAllRunVisuals, disposeRunVisuals } from "./charts.js";

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
    el.runsList.dataset.viewMode = state.runsViewMode;

    if (el.runsCount) el.runsCount.textContent = `${runs.length} 筆`;

    if (runs.length === 0) {
        disposeAllRunVisuals();
        el.runsList.innerHTML = '<p class="empty-state">目前沒有任何跑步活動。</p>';
        el.runsPagination.classList.add("hidden");
        return;
    }

    const totalPages = Math.ceil(runs.length / RUNS_PER_PAGE);
    const start = (state.runsPage - 1) * RUNS_PER_PAGE;
    const pageRuns = runs.slice(start, start + RUNS_PER_PAGE);

    disposeAllRunVisuals();
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

            if (e.target.closest(".run-export")) {
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
    runsList.dataset.viewMode = state.runsViewMode;

    const skeletonCard = `
        <article class="run-card skeleton-card">
            <div class="run-main">
                <div class="run-header">
                    <div>
                        <div class="skeleton" style="width: 140px; height: 1.2rem; margin-bottom: 0.5rem;"></div>
                        <div class="skeleton" style="width: 120px; height: 0.8rem;"></div>
                    </div>
                    <div class="skeleton" style="width: 64px; height: 1.8rem; border-radius: 999px;"></div>
                </div>
                <div class="run-ribbon">
                    <div class="metric-pill"><div class="skeleton" style="width: 88px;"></div></div>
                    <div class="metric-pill"><div class="skeleton" style="width: 92px;"></div></div>
                    <div class="metric-pill"><div class="skeleton" style="width: 86px;"></div></div>
                    <div class="metric-pill"><div class="skeleton" style="width: 82px;"></div></div>
                </div>
                <div class="run-card-side">
                    <div class="skeleton" style="width: 112px; height: 42px; border-radius: 12px;"></div>
                    <div class="run-actions">
                        <div class="skeleton" style="width: 88px; height: 2.2rem; border-radius: 999px;"></div>
                        <div class="skeleton" style="width: 2.2rem; height: 2.2rem; border-radius: 999px;"></div>
                    </div>
                </div>
            </div>
        </article>
    `;
    
    runsList.innerHTML = new Array(3).fill(skeletonCard).join("");
}

function createRunCardHtml(run) {
    const distNum = typeof run.distanceKm === "number" ? run.distanceKm : 0;
    const badge = distNum >= 21.1 ? "半馬級別" : distNum >= 10 ? "長跑" : "一般跑步";
    const heartRateLabel = run.averageHeartrate ? `${Math.round(run.averageHeartrate)} bpm` : "--";
    const escapedId = escapeHtml(String(run.id));
    
    return `
        <article id="run-${escapedId}" class="run-card">
            <div class="run-main">
                <div class="run-header">
                    <div class="run-heading">
                        <div class="run-title-row">
                            <h3 class="run-title">${escapeHtml(run.name)}</h3>
                            <a href="https://www.strava.com/activities/${escapedId}" target="_blank" rel="noopener" class="run-link-icon" aria-label="在 Strava 開啟活動" title="在 Strava 開啟活動">${buildExternalLinkIcon()}</a>
                        </div>
                        <div class="run-meta-line">
                            <p class="run-date">${escapeHtml(String(run.dateLabel || ""))}</p>
                            <span class="run-badge">${badge}</span>
                        </div>
                    </div>
                </div>
                <div class="run-ribbon">
                    ${createMetricPillHtml("distance", `${distNum.toFixed(2)} km`, "距離")}
                    ${createMetricPillHtml("pace", escapeHtml(String(run.averagePaceLabel || "")), "配速")}
                    ${createMetricPillHtml("duration", escapeHtml(String(run.movingTimeLabel || "")), "時間")}
                    ${createMetricPillHtml("heart", heartRateLabel, "心率")}
                </div>
                <div class="run-card-side">
                    <div class="run-sparkline" aria-hidden="true">
                        ${createSparklineSvg(run)}
                    </div>
                    <div class="run-actions">
                        <button class="btn btn-primary btn-sm btn-expand" data-id="${escapedId}">詳細分析</button>
                        <details class="run-export">
                            <summary class="btn btn-ghost btn-sm btn-icon" aria-label="匯出活動資料" title="匯出活動資料">
                                ${buildDownloadIcon()}
                            </summary>
                            <div class="run-export-menu">
                                <button class="run-export-option btn-download-json" type="button" data-id="${escapedId}">JSON</button>
                                <button class="run-export-option btn-download-md" type="button" data-id="${escapedId}">Markdown</button>
                            </div>
                        </details>
                    </div>
                </div>
            </div>
            <div id="run-details-${escapedId}" class="run-details hidden"></div>
        </article>
    `;
}

function createMetricPillHtml(icon, value, label) {
    return `
        <div class="metric-pill" title="${label}">
            <span class="metric-icon" aria-hidden="true">${buildMetricIcon(icon)}</span>
            <strong class="metric-pill-value">${value}</strong>
        </div>
    `;
}

function createSparklineSvg(run) {
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const idSeed = String(run.id).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const paceFactor = run.averagePaceSec ? clamp(420 / run.averagePaceSec, 0.2, 1) : 0.52;
    const hrFactor = run.averageHeartrate ? clamp((run.averageHeartrate - 110) / 55, 0.18, 1) : 0.44;
    const elevFactor = clamp((run.elevationGain || 0) / 240, 0.08, 1);
    const distanceFactor = clamp(run.distanceKm / 21.1, 0.16, 1);
    const varianceA = ((idSeed % 11) - 5) / 50;
    const varianceB = (((idSeed >> 2) % 13) - 6) / 55;
    const values = [
        clamp(0.4 + varianceA, 0.15, 0.9),
        clamp(paceFactor + varianceB, 0.18, 0.95),
        clamp(hrFactor, 0.18, 0.95),
        clamp(0.28 + elevFactor * 0.55, 0.15, 0.95),
        clamp(distanceFactor + varianceA * 0.8, 0.18, 0.95),
        clamp(0.46 + varianceB, 0.15, 0.95),
    ];

    const width = 112;
    const height = 36;
    const step = width / (values.length - 1);
    const points = values
        .map((value, index) => `${(index * step).toFixed(1)},${(height - value * (height - 6) - 3).toFixed(1)}`)
        .join(" ");

    return `
        <svg viewBox="0 0 ${width} ${height}" focusable="false">
            <polyline class="sparkline-fill" points="0,${height} ${points} ${width},${height}" />
            <polyline class="sparkline-line" points="${points}" />
        </svg>
    `;
}

function buildMetricIcon(type) {
    const icons = {
        distance: '<svg viewBox="0 0 24 24" focusable="false"><path d="M4 17 17 4"/><path d="M8 4h9v9"/><path d="M7 20h10"/></svg>',
        pace: '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="13" r="7"/><path d="M12 13 16 9"/><path d="M9 4h6"/></svg>',
        duration: '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="13" r="7"/><path d="M12 9v4l3 2"/><path d="M9 4h6"/></svg>',
        heart: '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 20s-7-4.4-7-9.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 7 3.4C19 15.6 12 20 12 20Z"/></svg>',
    };
    return icons[type] || icons.distance;
}

function buildDownloadIcon() {
    return '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M5 18h14"/></svg>';
}

function buildExternalLinkIcon() {
    return '<svg viewBox="0 0 24 24" focusable="false"><path d="M14 5h5v5"/><path d="M10 14 19 5"/><path d="M19 14v5H5V5h5"/></svg>';
}

export async function toggleRunDetails(runId) {
    const detailsEl = document.getElementById(`run-details-${runId}`);
    if (!detailsEl) return;

    const isHidden = detailsEl.classList.contains("hidden");
    if (!isHidden) {
        disposeRunVisuals(runId);
        detailsEl.innerHTML = "";
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
        detailsEl.innerHTML = `<p class="detail-copy status-error">載入失敗：${escapeHtml(String(error.message))}</p>`;
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
    disposeRunVisuals(run.id);
    if (!bundle || !bundle.detail || !bundle.streams) {
        container.innerHTML = `<p class="detail-copy status-error">載入失敗：無效的活動資料。</p>`;
        return;
    }

    const { detail, streams } = bundle;
    const hrSummary = buildHeartRateZoneSummary(streams, detail, state.athleteZones);
    const escapedId = escapeHtml(String(run.id));
    
    let weatherHtml = "";
    let intervalsHtml = "";

    const splits = detail.splits_metric || [];
    const paceSummary = getSplitPaceSummary(splits);
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
                                <td>${escapeHtml(String(s.split || ""))}</td>
                                ${buildSplitPaceCell(s, paceSummary)}
                                <td>${typeof s.elevation_difference === "number" ? Math.round(s.elevation_difference) : 0}m</td>
                                <td>${s.average_heartrate ? Math.round(s.average_heartrate) : "--"}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        </div>
    ` : "";

    // Calculate max display
    const maxGrade = typeof detail.max_grade === "number" ? `${detail.max_grade}%` : "--";
    const maxWatts = typeof detail.max_watts === "number" ? `${Math.round(detail.max_watts)}W` : "--";
    const calories = typeof detail.calories === "number" ? Math.round(detail.calories) : "--";

    container.innerHTML = `
        <div class="run-details-layout">
            <div class="run-detail-tabs" role="tablist" aria-label="單次跑步分析分頁">
                <button class="run-detail-tab is-active" type="button" role="tab" aria-selected="true" aria-controls="run-detail-panel-${escapedId}-overview" data-run-detail-tab="overview">綜合表現</button>
                <button class="run-detail-tab" type="button" role="tab" aria-selected="false" aria-controls="run-detail-panel-${escapedId}-hr" data-run-detail-tab="hr">心率分析</button>
                <button class="run-detail-tab" type="button" role="tab" aria-selected="false" aria-controls="run-detail-panel-${escapedId}-pace" data-run-detail-tab="pace">配速分析</button>
            </div>

            <section id="run-detail-panel-${escapedId}-overview" class="run-detail-panel is-active" role="tabpanel" data-run-detail-panel="overview">
                <div class="run-details-grid">
                    <div class="detail-card full-width">
                        <p class="detail-title">GPS 路線</p>
                        <div id="run-map-${escapedId}" class="run-map"></div>
                    </div>

                    <div class="detail-card full-width">
                        <p class="detail-title">性能趨勢</p>
                        <div class="chart-container" style="height: 200px;">
                            <canvas id="run-perf-chart-${escapedId}"></canvas>
                        </div>
                    </div>

                    <div class="detail-card full-width">
                        <p class="detail-title">海拔高度</p>
                        <div class="chart-container" style="height: 180px;">
                            <canvas id="run-elev-chart-${escapedId}"></canvas>
                        </div>
                    </div>

                    <div class="detail-card">
                        <p class="detail-title">數據摘要</p>
                        <p class="detail-copy">
                            總爬升：${Math.round(run.elevationGain || 0)}m · 
                            最大坡度：${maxGrade} · 
                            最大功率：${maxWatts} · 
                            卡路里：${calories} kcal
                        </p>
                    </div>

                    ${weatherHtml || ""}
                    ${intervalsHtml || ""}
                </div>
            </section>

            <section id="run-detail-panel-${escapedId}-hr" class="run-detail-panel hidden" role="tabpanel" data-run-detail-panel="hr">
                <div class="run-details-grid">
                    <div class="detail-card full-width">
                        <p class="detail-title">心率與海拔</p>
                        <div class="chart-container" style="height: 200px;">
                            <canvas id="run-hr-elev-chart-${escapedId}"></canvas>
                        </div>
                    </div>

                    <div class="detail-card full-width">
                        <p class="detail-title">心率區間分佈</p>
                        <div id="hr-zones-bar-${escapedId}" class="hr-zones-bar"></div>
                        <div id="hr-zones-legend-${escapedId}" class="hr-zones-legend"></div>
                    </div>
                </div>
            </section>

            <section id="run-detail-panel-${escapedId}-pace" class="run-detail-panel hidden" role="tabpanel" data-run-detail-panel="pace">
                <div class="run-details-grid">
                    <div class="detail-card full-width">
                        <p class="detail-title">配速與海拔</p>
                        <div class="chart-container" style="height: 200px;">
                            <canvas id="run-pace-elev-chart-${escapedId}"></canvas>
                        </div>
                    </div>
                    ${splitsHtml}
                </div>
            </section>
        </div>
    `;
    bindRunDetailTabs(container, run.id, bundle, hrSummary);

    // Trigger chart rendering after a short delay to ensure canvas is ready
    setTimeout(() => {
        renderActivityDetailCharts(run.id, bundle, hrSummary, "overview");
    }, 60);
}

function bindRunDetailTabs(container, runId, bundle, hrSummary) {
    const tabs = Array.from(container.querySelectorAll(".run-detail-tab"));
    const panels = Array.from(container.querySelectorAll(".run-detail-panel"));
    if (tabs.length === 0 || panels.length === 0) return;

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            const target = tab.dataset.runDetailTab;
            tabs.forEach((button) => {
                const isActive = button === tab;
                button.classList.toggle("is-active", isActive);
                button.setAttribute("aria-selected", String(isActive));
            });

            panels.forEach((panel) => {
                panel.classList.toggle("hidden", panel.dataset.runDetailPanel !== target);
                panel.classList.toggle("is-active", panel.dataset.runDetailPanel === target);
            });

            setTimeout(() => {
                renderActivityDetailCharts(runId, bundle, hrSummary, target);
                resizeRunVisuals(runId);
            }, 80);
        });
    });
}

function getSplitPaceSummary(splits) {
    const paceSeconds = splits
        .map((split) => Number.isFinite(split?.average_speed) && split.average_speed > 0 ? 1000 / split.average_speed : null)
        .filter((pace) => Number.isFinite(pace));

    if (paceSeconds.length === 0) {
        return { min: null, max: null };
    }

    return {
        min: Math.min(...paceSeconds),
        max: Math.max(...paceSeconds),
    };
}

function buildSplitPaceCell(split, summary) {
    const paceLabel = formatPaceFromSpeed(split.average_speed);
    const paceSec = Number.isFinite(split?.average_speed) && split.average_speed > 0 ? 1000 / split.average_speed : null;

    if (!Number.isFinite(paceSec) || !Number.isFinite(summary.min) || !Number.isFinite(summary.max)) {
        return `<td>${paceLabel}</td>`;
    }

    const range = Math.max(summary.max - summary.min, 1e-6);
    const normalized = Math.max(0, Math.min(1, (paceSec - summary.min) / range));
    const color = blendRgb([94, 234, 212], [248, 113, 113], normalized);

    let badgeClass = "";
    if (Math.abs(paceSec - summary.min) < 1e-6) badgeClass = "is-fastest";
    if (Math.abs(paceSec - summary.max) < 1e-6) badgeClass = "is-slowest";

    return `<td class="split-pace-cell ${badgeClass}" style="color: ${color};">${paceLabel}</td>`;
}

function blendRgb(from, to, ratio) {
    const value = Math.max(0, Math.min(1, ratio));
    const r = Math.round(from[0] + (to[0] - from[0]) * value);
    const g = Math.round(from[1] + (to[1] - from[1]) * value);
    const b = Math.round(from[2] + (to[2] - from[2]) * value);
    return `rgb(${r}, ${g}, ${b})`;
}
