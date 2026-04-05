import { state } from "../state.js";

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

/**
 * Helper to downsample time-series data for chart performance.
 */
function downsample(data, limit = 150) {
    if (!Array.isArray(data) || data.length <= limit) return data;
    const step = Math.max(1, Math.floor(data.length / limit));
    return data.filter((_, i) => i % step === 0);
}

/**
 * Format seconds into MM:SS string.
 */
function formatTimeLabel(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Render detailed activity charts (Split Trend lines + HR zones bar).
 * @param {string} runId - Activity ID.
 * @param {object} bundle - Contains detail and streams.
 * @param {object} hrSummary - Pre-calculated HR zone summary.
 */
export function renderActivityDetailCharts(runId, bundle, hrSummary) {
    const perfCanvas = document.getElementById(`run-perf-chart-${runId}`);
    const elevCanvas = document.getElementById(`run-elev-chart-${runId}`);
    const hrZonesCanvas = document.getElementById(`hr-zones-chart-${runId}`);
    const { streams } = bundle;

    if (!window.Chart) return;

    if (streams?.time?.data) {
        const timeData = streams.time.data;
        const hrData = streams.heartrate?.data || [];
        const altitudeData = streams.altitude?.data || [];
        const velocityData = streams.velocity_smooth?.data || [];

        // Downsample all streams uniformly
        const indices = downsample(timeData.map((_, i) => i), 100);
        const timeLabels = indices.map(i => formatTimeLabel(timeData[i]));
        const dsHr = indices.map(i => hrData[i] || null);
        const dsAlt = indices.map(i => altitudeData[i] || null);
        const dsPace = indices.map(i => {
            const speed = velocityData[i];
            if (!speed || speed <= 0.5) return null; // Filter out stops
            return 1000 / (speed * 60); // min/km
        });

        // 1. Performance Chart (Pace Left, HR Right)
        if (perfCanvas) {
            new window.Chart(perfCanvas, {
                type: "line",
                data: {
                    labels: timeLabels,
                    datasets: [
                        {
                            label: "配速 (min/km)",
                            data: dsPace,
                            borderColor: "#5eead4",
                            backgroundColor: "transparent",
                            borderWidth: 2,
                            pointRadius: 0,
                            tension: 0.3,
                            yAxisID: "y-pace",
                        },
                        {
                            label: "心率 (bpm)",
                            data: dsHr,
                            borderColor: "#fb7185",
                            backgroundColor: "transparent",
                            borderWidth: 2,
                            pointRadius: 0,
                            tension: 0.3,
                            yAxisID: "y-hr",
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: "index", intersect: false },
                    plugins: {
                        legend: { display: true, position: "top", labels: { color: "#99aebe", font: { size: 10 } } }
                    },
                    scales: {
                        x: { display: true, grid: { display: false }, ticks: { color: "#99aebe", maxTicksLimit: 6, font: { size: 9 } } },
                        "y-pace": {
                            type: "linear",
                            position: "left",
                            reverse: true,
                            min: 3,
                            max: 12,
                            title: { display: true, text: "配速", color: "#5eead4", font: { size: 10 } },
                            grid: { color: "rgba(255, 255, 255, 0.05)" },
                            ticks: { color: "#5eead4", font: { size: 9 } }
                        },
                        "y-hr": {
                            type: "linear",
                            position: "right",
                            title: { display: true, text: "心率", color: "#fb7185", font: { size: 10 } },
                            grid: { display: false },
                            ticks: { color: "#fb7185", font: { size: 9 } }
                        }
                    }
                }
            });
        }

        // 2. Elevation Chart (Left Axis)
        if (elevCanvas) {
            new window.Chart(elevCanvas, {
                type: "line",
                data: {
                    labels: timeLabels,
                    datasets: [{
                        label: "海拔高度 (m)",
                        data: dsAlt,
                        borderColor: "#94a3b8",
                        backgroundColor: "rgba(148, 163, 184, 0.1)",
                        borderWidth: 1.5,
                        fill: true,
                        pointRadius: 0,
                        tension: 0.2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: true, position: "top", labels: { color: "#99aebe", font: { size: 10 } } }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { color: "#99aebe", maxTicksLimit: 6, font: { size: 9 } } },
                        y: { title: { display: true, text: "高度 (m)", color: "#99aebe", font: { size: 10 } }, grid: { color: "rgba(255, 255, 255, 0.05)" }, ticks: { color: "#99aebe", font: { size: 9 } } }
                    }
                }
            });
        }
    }

    if (hrZonesCanvas && hrSummary) {
        const zoneColors = [
            "rgba(74, 222, 128, 0.6)", // Z1
            "rgba(163, 230, 53, 0.6)", // Z2
            "rgba(250, 204, 21, 0.6)", // Z3
            "rgba(251, 146, 60, 0.6)", // Z4
            "rgba(248, 113, 113, 0.6)"  // Z5
        ];

        new window.Chart(hrZonesCanvas, {
            type: "bar",
            data: {
                labels: hrSummary.zones.map(z => z.label),
                datasets: [{
                    label: "百分比 (%)",
                    data: hrSummary.zones.map(z => (z.share * 100).toFixed(1)),
                    backgroundColor: zoneColors,
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label(context) {
                                const zone = hrSummary.zones[context.dataIndex];
                                return `${context.formattedValue}% (${Math.round(zone.seconds / 60)} 分鐘)`;
                            }
                        }
                    }
                },
                scales: {
                    x: { beginAtZero: true, max: 100, grid: { color: "rgba(255, 255, 255, 0.05)" }, ticks: { color: "#99aebe", font: { size: 9 } } },
                    y: { grid: { display: false }, ticks: { color: "#99aebe", font: { size: 10, weight: "bold" } } }
                }
            }
        });
    }
}


