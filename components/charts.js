import { state } from "../state.js";

const HR_ZONE_COLORS = [
    "rgba(74, 222, 128, 0.82)", // Z1
    "rgba(163, 230, 53, 0.82)", // Z2
    "rgba(250, 204, 21, 0.82)", // Z3
    "rgba(251, 146, 60, 0.84)", // Z4
    "rgba(248, 113, 113, 0.86)", // Z5
];

const syncCrosshairPlugin = {
    id: "syncCrosshair",
    afterDatasetsDraw(chart, _args, opts) {
        const active = chart.tooltip?.getActiveElements?.() || [];
        if (active.length === 0) return;

        const element = active[0]?.element;
        if (!element) return;

        const { ctx, chartArea } = chart;
        if (!ctx || !chartArea) return;

        ctx.save();
        ctx.strokeStyle = opts?.color || "rgba(153, 174, 190, 0.35)";
        ctx.lineWidth = opts?.width || 1;
        ctx.setLineDash(opts?.dash || [4, 4]);
        ctx.beginPath();
        ctx.moveTo(element.x, chartArea.top);
        ctx.lineTo(element.x, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
    },
};

let syncPluginReady = false;

function ensureSyncPlugin() {
    if (!window.Chart || syncPluginReady) return;
    window.Chart.register(syncCrosshairPlugin);
    syncPluginReady = true;
}

/**
 * Render the weekly mileage trend chart.
 * @param {Array} weeklyTrend - Trend data from activity summary.
 */
export function renderWeeklyChart(weeklyTrend) {
    const weeklyChartCanvas = document.getElementById("weekly-chart");
    if (!window.Chart || !weeklyChartCanvas) return;

    if (state.weeklyChart) {
        state.weeklyChart.destroy();
    }

    state.weeklyChart = new window.Chart(weeklyChartCanvas, {
        type: "line",
        data: {
            labels: weeklyTrend.map((entry) => entry.label),
            datasets: [
                {
                    label: "跑量 (km)",
                    data: weeklyTrend.map((entry) => entry.distanceKm),
                    borderColor: "rgba(94, 234, 212, 0.95)",
                    backgroundColor: "rgba(94, 234, 212, 0.14)",
                    borderWidth: 2,
                    fill: true,
                    spanGaps: true,
                    tension: 0.28,
                    cubicInterpolationMode: "monotone",
                    pointRadius: 2,
                    pointHoverRadius: 4,
                    pointBackgroundColor: "rgba(249, 115, 22, 0.92)",
                    pointBorderColor: "rgba(4, 11, 18, 0.95)",
                    pointBorderWidth: 1.5,
                },
            ],
        },
        options: {
            ...buildChartPerformanceOptions(),
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: "index",
                intersect: false,
            },
            plugins: {
                legend: {
                    labels: { color: "#edf6f3" },
                },
                tooltip: {
                    callbacks: {
                        afterLabel(context) {
                            const trendEntry = weeklyTrend[context.dataIndex];
                            return `跑步次數: ${trendEntry.runCount}`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    ticks: {
                        color: "#99aebe",
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 6,
                    },
                    grid: { display: false },
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: "#99aebe" },
                    grid: { color: "rgba(153, 174, 190, 0.08)" },
                },
            },
        },
    });
}

function buildChartPerformanceOptions() {
    return {
        animation: false,
        normalized: true,
    };
}

/**
 * Build downsampled indexes without allocating an intermediate full-length array.
 */
function buildDownsampledIndices(length, limit = 150) {
    if (!Number.isInteger(length) || length <= 0) return [];
    if (length <= limit) return Array.from({ length }, (_, index) => index);

    const step = Math.max(1, Math.floor(length / limit));
    const indices = [];
    for (let index = 0; index < length; index += step) {
        indices.push(index);
    }
    return indices;
}

/**
 * Format seconds into MM:SS string.
 */
function formatTimeLabel(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatZoneDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${totalMinutes}m`;
}

function destroyRunVisuals(runId) {
    const existing = state.runCharts.get(runId);
    if (!existing) return;

    const charts = existing.chartsByKey ? Array.from(existing.chartsByKey.values()) : existing.charts || [];
    for (const chart of charts) {
        try {
            chart.destroy();
        } catch (error) {
            console.warn("Failed to destroy chart:", error);
        }
    }

    if (existing.map) {
        try {
            existing.map.remove();
        } catch (error) {
            console.warn("Failed to destroy map:", error);
        }
    }

    state.runCharts.delete(runId);
}

export function disposeRunVisuals(runId) {
    destroyRunVisuals(runId);
}

export function disposeAllRunVisuals() {
    const keys = Array.from(state.runCharts.keys());
    keys.forEach((runId) => destroyRunVisuals(runId));
}

function getFirstUsableDatasetIndex(chart, dataIndex) {
    const datasets = chart?.data?.datasets || [];
    for (let datasetIndex = 0; datasetIndex < datasets.length; datasetIndex += 1) {
        const value = datasets[datasetIndex]?.data?.[dataIndex];
        if (value == null) continue;
        if (typeof value === "number" && !Number.isFinite(value)) continue;
        return datasetIndex;
    }
    return -1;
}

function setChartActiveIndex(chart, dataIndex) {
    if (!chart?.tooltip) return;

    if (!Number.isInteger(dataIndex) || dataIndex < 0) {
        chart.setActiveElements([]);
        chart.tooltip.setActiveElements([], { x: 0, y: 0 });
        chart.update("none");
        return;
    }

    const datasetIndex = getFirstUsableDatasetIndex(chart, dataIndex);
    if (datasetIndex < 0) {
        chart.setActiveElements([]);
        chart.tooltip.setActiveElements([], { x: 0, y: 0 });
        chart.update("none");
        return;
    }

    const element = chart.getDatasetMeta(datasetIndex)?.data?.[dataIndex];
    if (!element) {
        chart.setActiveElements([]);
        chart.tooltip.setActiveElements([], { x: 0, y: 0 });
        chart.update("none");
        return;
    }

    const active = [{ datasetIndex, index: dataIndex }];
    chart.setActiveElements(active);
    chart.tooltip.setActiveElements(active, { x: element.x, y: element.y });
    chart.update("none");
}

function bindSynchronizedHover(charts) {
    const synced = charts.filter(Boolean);
    if (synced.length <= 1) return;

    const syncTo = (source, dataIndex) => {
        synced.forEach((chart) => {
            if (chart === source) return;
            setChartActiveIndex(chart, dataIndex);
        });
    };

    synced.forEach((chart) => {
        chart.options.onHover = (_event, activeElements) => {
            const hovered = Array.isArray(activeElements) ? activeElements : [];
            if (hovered.length === 0) {
                syncTo(chart, null);
                return;
            }
            syncTo(chart, hovered[0].index);
        };

        if (chart.$strideMouseLeaveHandler) {
            chart.canvas?.removeEventListener("mouseleave", chart.$strideMouseLeaveHandler);
        }

        chart.$strideMouseLeaveHandler = () => {
            synced.forEach((targetChart) => setChartActiveIndex(targetChart, null));
        };
        chart.canvas?.addEventListener("mouseleave", chart.$strideMouseLeaveHandler);

        chart.update("none");
    });
}

function renderHeartRateZoneBar(runId, hrSummary) {
    const barHost = document.getElementById(`hr-zones-bar-${runId}`);
    const legendHost = document.getElementById(`hr-zones-legend-${runId}`);
    if (!barHost || !legendHost) return;

    if (!hrSummary || !Array.isArray(hrSummary.zones) || hrSummary.zones.length === 0) {
        barHost.innerHTML = '<p class="detail-copy">心率區間資料不足</p>';
        legendHost.innerHTML = "";
        return;
    }

    const segments = hrSummary.zones.map((zone, index) => {
        const sharePercent = Number((zone.share * 100).toFixed(1));
        const width = Math.max(zone.share * 100, 1.8);
        return `
            <div class="hr-zone-segment" style="--zone-color:${HR_ZONE_COLORS[index] || HR_ZONE_COLORS[HR_ZONE_COLORS.length - 1]}; --zone-width:${width}%;" title="${zone.label} ${sharePercent}% (${formatZoneDuration(zone.seconds)})"></div>
        `;
    }).join("");

    const legends = hrSummary.zones.map((zone, index) => `
        <div class="hr-zone-legend-item">
            <span class="hr-zone-dot" style="--zone-color:${HR_ZONE_COLORS[index] || HR_ZONE_COLORS[HR_ZONE_COLORS.length - 1]};"></span>
            <span class="hr-zone-legend-label">${zone.label}</span>
            <strong>${(zone.share * 100).toFixed(1)}%</strong>
            <span>${formatZoneDuration(zone.seconds)}</span>
        </div>
    `).join("");

    barHost.innerHTML = `
        <div class="hr-zone-track">
            ${segments}
        </div>
    `;
    legendHost.innerHTML = legends;
}

function getLatLngPoints(streams) {
    const latlng = streams?.latlng?.data;
    if (!Array.isArray(latlng)) return [];

    return latlng
        .filter((point) =>
            Array.isArray(point)
            && point.length >= 2
            && Number.isFinite(point[0])
            && Number.isFinite(point[1]))
        .map(([lat, lng]) => [lat, lng]);
}

const DETAIL_CHART_AXIS_WIDTH = {
    left: 52,
    right: 52,
};

function lockAxisWidth(width) {
    return {
        afterFit(scale) {
            scale.width = width;
        },
    };
}

function buildDetailChartPlugins() {
    return {
        legend: {
            display: true,
            position: "top",
            labels: { color: "#99aebe", font: { size: 10 } },
        },
        syncCrosshair: { color: "rgba(153, 174, 190, 0.42)" },
    };
}

function buildDetailXAxis() {
    return {
        display: true,
        grid: { display: false },
        ticks: { color: "#99aebe", maxTicksLimit: 6, font: { size: 9 } },
    };
}

function buildDetailAxisTitle(text, color) {
    return {
        display: true,
        text,
        color,
        font: { size: 10 },
        padding: { top: 0, bottom: 6 },
    };
}

function renderRunRouteMap(runId, bundle) {
    const container = document.getElementById(`run-map-${runId}`);
    if (!container) return null;

    const points = getLatLngPoints(bundle?.streams);
    if (points.length < 2) {
        container.innerHTML = '<p class="detail-copy">此活動沒有可用的 GPS 軌跡。</p>';
        return null;
    }

    if (!window.L) {
        container.innerHTML = '<p class="detail-copy">地圖元件尚未載入，稍後再試。</p>';
        return null;
    }

    container.innerHTML = "";

    const map = window.L.map(container, {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: false,
        tap: false,
    });

    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 20,
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    }).addTo(map);

    const routeOutline = window.L.polyline(points, {
        color: "rgba(8, 15, 23, 0.72)",
        weight: 8,
        opacity: 0.9,
    }).addTo(map);

    const track = window.L.polyline(points, {
        color: "#5eead4",
        weight: 4.5,
        opacity: 0.96,
    }).addTo(map);

    window.L.circleMarker(points[0], {
        radius: 5,
        color: "#14b8a6",
        fillColor: "#5eead4",
        fillOpacity: 0.95,
        weight: 2,
    }).addTo(map);

    window.L.circleMarker(points[points.length - 1], {
        radius: 5,
        color: "#fb7185",
        fillColor: "#f97316",
        fillOpacity: 0.95,
        weight: 2,
    }).addTo(map);

    map.fitBounds(routeOutline.getBounds(), { padding: [24, 24] });

    setTimeout(() => {
        try {
            map.invalidateSize();
        } catch (error) {
            console.warn("Map resize failed:", error);
        }
    }, 90);

    return map;
}

export function resizeRunVisuals(runId) {
    const visuals = state.runCharts.get(runId);
    if (!visuals) return;

    const charts = visuals.chartsByKey ? Array.from(visuals.chartsByKey.values()) : visuals.charts || [];
    for (const chart of charts) {
        try {
            chart.resize();
        } catch (error) {
            console.warn("Chart resize failed:", error);
        }
    }

    if (visuals.map) {
        setTimeout(() => {
            try {
                visuals.map.invalidateSize();
            } catch (error) {
                console.warn("Map resize failed:", error);
            }
        }, 60);
    }
}

function getRunVisuals(runId, bundle, hrSummary) {
    const existing = state.runCharts.get(runId);
    if (existing) {
        existing.bundle = bundle;
        existing.hrSummary = hrSummary;
        return existing;
    }

    const visuals = {
        bundle,
        hrSummary,
        chartsByKey: new Map(),
        chartData: null,
        renderedPanels: new Set(),
        map: null,
    };
    state.runCharts.set(runId, visuals);
    return visuals;
}

function getRunVisualCharts(visuals) {
    return visuals?.chartsByKey ? Array.from(visuals.chartsByKey.values()) : [];
}

function buildDetailChartData(bundle) {
    const streams = bundle?.streams;
    const timeData = streams?.time?.data;
    if (!Array.isArray(timeData) || timeData.length === 0) return null;

    const hrData = streams.heartrate?.data || [];
    const altitudeData = streams.altitude?.data || [];
    const velocityData = streams.velocity_smooth?.data || [];
    const indices = buildDownsampledIndices(timeData.length, 100);
    const timeLabels = indices.map((index) => formatTimeLabel(timeData[index]));
    const dsHr = indices.map((index) => hrData[index] || null);
    const dsAlt = indices.map((index) => altitudeData[index] || null);
    const dsPace = indices.map((index) => {
        const speed = velocityData[index];
        if (!speed || speed <= 0.5) return null;
        return 1000 / (speed * 60);
    });

    const validPaces = dsPace.filter((pace) => pace !== null && pace < 45);
    const maxPaceVal = validPaces.length ? Math.max(...validPaces) : 12;
    const minPaceVal = validPaces.length ? Math.min(...validPaces) : 3;

    return {
        timeLabels,
        dsHr,
        dsAlt,
        dsPace,
        yPaceMax: Math.min(35, Math.ceil(maxPaceVal) + 1),
        yPaceMin: Math.max(1, Math.floor(minPaceVal) - 1),
    };
}

function getCachedDetailChartData(visuals) {
    if (!visuals.chartData) {
        visuals.chartData = buildDetailChartData(visuals.bundle);
    }
    return visuals.chartData;
}

function setChartUnavailableMessage(runId, chartKeys) {
    chartKeys.forEach((key) => {
        const canvas = document.getElementById(`run-${key}-chart-${runId}`);
        const container = canvas?.closest(".chart-container");
        if (!container) return;
        container.innerHTML = '<p class="detail-copy">圖表元件未載入，暫時無法顯示趨勢圖。</p>';
    });
}

function createRunChart(visuals, key, canvas, config) {
    if (!canvas || visuals.chartsByKey.has(key)) return;
    visuals.chartsByKey.set(key, new window.Chart(canvas, config));
}

function buildDetailChartOptions(scales) {
    return {
        ...buildChartPerformanceOptions(),
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { left: 4, right: 4 } },
        plugins: {
            ...buildDetailChartPlugins(),
        },
        scales,
    };
}

function renderOverviewVisuals(runId, visuals, chartData) {
    if (visuals.renderedPanels.has("overview")) return;

    if (window.Chart && chartData) {
        const perfCanvas = document.getElementById(`run-perf-chart-${runId}`);
        const elevCanvas = document.getElementById(`run-elev-chart-${runId}`);

        createRunChart(visuals, "perf", perfCanvas, {
            type: "line",
            data: {
                labels: chartData.timeLabels,
                datasets: [
                    {
                        label: "配速 (min/km)",
                        data: chartData.dsPace,
                        borderColor: "#5eead4",
                        backgroundColor: "transparent",
                        borderWidth: 1,
                        pointRadius: 0,
                        spanGaps: true,
                        tension: 0.3,
                        yAxisID: "y-pace",
                    },
                    {
                        label: "心率 (bpm)",
                        data: chartData.dsHr,
                        borderColor: "#fb7185",
                        backgroundColor: "transparent",
                        borderWidth: 1,
                        pointRadius: 0,
                        spanGaps: true,
                        tension: 0.3,
                        yAxisID: "y-hr",
                    },
                ],
            },
            options: buildDetailChartOptions({
                x: buildDetailXAxis(),
                "y-pace": {
                    type: "linear",
                    position: "left",
                    reverse: true,
                    min: chartData.yPaceMin,
                    max: chartData.yPaceMax,
                    title: buildDetailAxisTitle("配速", "#5eead4"),
                    grid: { color: "rgba(255, 255, 255, 0.05)" },
                    ticks: { color: "#5eead4", font: { size: 9 }, padding: 6 },
                    ...lockAxisWidth(DETAIL_CHART_AXIS_WIDTH.left),
                },
                "y-hr": {
                    type: "linear",
                    position: "right",
                    title: buildDetailAxisTitle("心率", "#fb7185"),
                    grid: { display: false },
                    ticks: { color: "#fb7185", font: { size: 9 }, padding: 6 },
                    ...lockAxisWidth(DETAIL_CHART_AXIS_WIDTH.right),
                },
            }),
        });

        createRunChart(visuals, "elev", elevCanvas, {
            type: "line",
            data: {
                labels: chartData.timeLabels,
                datasets: [
                    {
                        label: "海拔高度 (m)",
                        data: chartData.dsAlt,
                        borderColor: "#94a3b8",
                        backgroundColor: "rgba(148, 163, 184, 0.1)",
                        borderWidth: 1.5,
                        fill: true,
                        pointRadius: 0,
                        spanGaps: true,
                        tension: 0.2,
                    },
                ],
            },
            options: buildDetailChartOptions({
                x: buildDetailXAxis(),
                y: {
                    title: buildDetailAxisTitle("海拔", "#99aebe"),
                    grid: { color: "rgba(255, 255, 255, 0.05)" },
                    ticks: { color: "#99aebe", font: { size: 9 }, padding: 6 },
                    ...lockAxisWidth(DETAIL_CHART_AXIS_WIDTH.left),
                },
                "y-spacer": {
                    type: "linear",
                    position: "right",
                    display: false,
                    min: 0,
                    max: 1,
                    grid: { display: false, drawOnChartArea: false, drawTicks: false },
                    ticks: { display: false },
                    border: { display: false },
                    ...lockAxisWidth(DETAIL_CHART_AXIS_WIDTH.right),
                },
            }),
        });
    } else {
        setChartUnavailableMessage(runId, ["perf", "elev"]);
    }

    visuals.map = renderRunRouteMap(runId, visuals.bundle);
    visuals.renderedPanels.add("overview");
}

function renderHeartRateVisuals(runId, visuals, chartData) {
    if (visuals.renderedPanels.has("hr")) return;

    if (window.Chart && chartData) {
        const hrElevCanvas = document.getElementById(`run-hr-elev-chart-${runId}`);
        createRunChart(visuals, "hr-elev", hrElevCanvas, {
            type: "line",
            data: {
                labels: chartData.timeLabels,
                datasets: [
                    {
                        label: "海拔高度 (m)",
                        data: chartData.dsAlt,
                        borderColor: "transparent",
                        backgroundColor: "rgba(148, 163, 184, 0.2)",
                        borderWidth: 0,
                        fill: true,
                        pointRadius: 0,
                        spanGaps: true,
                        tension: 0.2,
                        yAxisID: "y-elev",
                    },
                    {
                        label: "心率 (bpm)",
                        data: chartData.dsHr,
                        borderColor: "#fb7185",
                        backgroundColor: "transparent",
                        borderWidth: 2,
                        pointRadius: 0,
                        spanGaps: true,
                        tension: 0.3,
                        yAxisID: "y-hr",
                    },
                ],
            },
            options: buildDetailChartOptions({
                x: buildDetailXAxis(),
                "y-hr": {
                    type: "linear",
                    position: "left",
                    title: buildDetailAxisTitle("心率", "#fb7185"),
                    grid: { color: "rgba(255, 255, 255, 0.05)" },
                    ticks: { color: "#fb7185", font: { size: 9 }, padding: 6 },
                    ...lockAxisWidth(DETAIL_CHART_AXIS_WIDTH.left),
                },
                "y-elev": {
                    type: "linear",
                    position: "right",
                    title: buildDetailAxisTitle("海拔", "#94a3b8"),
                    grid: { display: false },
                    ticks: { color: "#94a3b8", font: { size: 9 }, padding: 6 },
                    ...lockAxisWidth(DETAIL_CHART_AXIS_WIDTH.right),
                },
            }),
        });
    } else {
        setChartUnavailableMessage(runId, ["hr-elev"]);
    }

    renderHeartRateZoneBar(runId, visuals.hrSummary);
    visuals.renderedPanels.add("hr");
}

function renderPaceVisuals(runId, visuals, chartData) {
    if (visuals.renderedPanels.has("pace")) return;

    if (window.Chart && chartData) {
        const paceElevCanvas = document.getElementById(`run-pace-elev-chart-${runId}`);
        createRunChart(visuals, "pace-elev", paceElevCanvas, {
            type: "line",
            data: {
                labels: chartData.timeLabels,
                datasets: [
                    {
                        label: "海拔高度 (m)",
                        data: chartData.dsAlt,
                        borderColor: "transparent",
                        backgroundColor: "rgba(148, 163, 184, 0.2)",
                        borderWidth: 0,
                        fill: true,
                        pointRadius: 0,
                        spanGaps: true,
                        tension: 0.2,
                        yAxisID: "y-elev",
                    },
                    {
                        label: "配速 (min/km)",
                        data: chartData.dsPace,
                        borderColor: "#5eead4",
                        backgroundColor: "transparent",
                        borderWidth: 1,
                        pointRadius: 0,
                        spanGaps: true,
                        tension: 0.3,
                        yAxisID: "y-pace",
                    },
                ],
            },
            options: buildDetailChartOptions({
                x: buildDetailXAxis(),
                "y-pace": {
                    type: "linear",
                    position: "left",
                    reverse: true,
                    min: chartData.yPaceMin,
                    max: chartData.yPaceMax,
                    title: buildDetailAxisTitle("配速", "#5eead4"),
                    grid: { color: "rgba(255, 255, 255, 0.05)" },
                    ticks: { color: "#5eead4", font: { size: 9 }, padding: 6 },
                    ...lockAxisWidth(DETAIL_CHART_AXIS_WIDTH.left),
                },
                "y-elev": {
                    type: "linear",
                    position: "right",
                    title: buildDetailAxisTitle("海拔", "#94a3b8"),
                    grid: { display: false },
                    ticks: { color: "#94a3b8", font: { size: 9 }, padding: 6 },
                    ...lockAxisWidth(DETAIL_CHART_AXIS_WIDTH.right),
                },
            }),
        });
    } else {
        setChartUnavailableMessage(runId, ["pace-elev"]);
    }

    visuals.renderedPanels.add("pace");
}

/**
 * Render detailed activity visuals for the requested tab only.
 * @param {string} runId - Activity ID.
 * @param {object} bundle - Contains detail and streams.
 * @param {object} hrSummary - Pre-calculated HR zone summary.
 * @param {string} panel - Detail tab to render: overview, hr, or pace.
 */
export function renderActivityDetailCharts(runId, bundle, hrSummary, panel = "overview") {
    const detailsEl = document.getElementById(`run-details-${runId}`);
    if (!detailsEl || detailsEl.classList.contains("hidden")) return;

    const visuals = getRunVisuals(runId, bundle, hrSummary);
    const chartData = getCachedDetailChartData(visuals);

    if (window.Chart && chartData) {
        ensureSyncPlugin();
    }

    if (panel === "hr") {
        renderHeartRateVisuals(runId, visuals, chartData);
    } else if (panel === "pace") {
        renderPaceVisuals(runId, visuals, chartData);
    } else {
        renderOverviewVisuals(runId, visuals, chartData);
    }

    bindSynchronizedHover(getRunVisualCharts(visuals));
    resizeRunVisuals(runId);
}
