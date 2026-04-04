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
 * Placeholder for future run-specific charts (e.g., heart rate vs elevation).
 * @param {HTMLCanvasElement} canvas - Target canvas element.
 * @param {object} bundle - Activity detail bundle.
 */
export function renderRunChart(canvas, bundle) {
    // Current app uses static HTML for now, but we can migrate 
    // run detail charts here if we add them.
}
