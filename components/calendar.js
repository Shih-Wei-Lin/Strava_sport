import { state, STORAGE_KEYS } from "../state.js";
import { formatPaceFromSeconds, formatDuration, toLocalDateKey } from "../analytics.js";

/**
 * Render the running activity calendar.
 * @param {Array} runs - Normalized run activities.
 */
export function renderCalendar(runs) {
    const el = {
        calendarGrid: document.getElementById("calendar-grid"),
        calMonthLabel: document.getElementById("cal-month-label"),
        heatmapLegend: document.getElementById("heatmap-legend"),
    };

    if (!el.calendarGrid || !el.calMonthLabel) return;

    const firstDayOfMonth = new Date(state.calYear, state.calMonth, 1);
    const lastDayOfMonth = new Date(state.calYear, state.calMonth + 1, 0);
    const prevMonthLastDay = new Date(state.calYear, state.calMonth, 0);

    el.calMonthLabel.textContent = `${state.calYear}年 ${state.calMonth + 1}月`;

    const firstDayWeekday = firstDayOfMonth.getDay();
    const totalDays = lastDayOfMonth.getDate();

    const fragment = document.createDocumentFragment();

    // Previous month days filling
    for (let i = firstDayWeekday - 1; i >= 0; i--) {
        const day = prevMonthLastDay.getDate() - i;
        fragment.appendChild(createCalendarDay(day, true));
    }

    // Current month days
    const todayStr = toLocalDateKey(new Date());
    const activitiesByDate = groupActivitiesByDate(runs);
    const monthSummaries = [...activitiesByDate.entries()]
        .filter(([dateKey]) => {
            const date = new Date(`${dateKey}T00:00:00`);
            return date.getFullYear() === state.calYear && date.getMonth() === state.calMonth;
        })
        .map(([, activity]) => activity);
    
    const intensityMax = getCalendarMetricMax(monthSummaries, state.calendarHeatmapMode);

    if (el.heatmapLegend) {
        el.heatmapLegend.textContent = buildHeatmapLegendText(state.calendarHeatmapMode, intensityMax);
    }

    for (let i = 1; i <= totalDays; i++) {
        const date = new Date(state.calYear, state.calMonth, i);
        const dateStr = toLocalDateKey(date);
        const activity = activitiesByDate.get(dateStr);
        const isToday = dateStr === todayStr;

        fragment.appendChild(createCalendarDay(i, false, isToday, activity, intensityMax));
    }

    // Next month filler
    const remainingSlots = 42 - fragment.children.length;
    for (let i = 1; i <= remainingSlots; i++) {
        fragment.appendChild(createCalendarDay(i, true));
    }

    el.calendarGrid.innerHTML = "";
    el.calendarGrid.appendChild(fragment);
}

function createCalendarDay(day, isOtherMonth, isToday = false, activity = null, intensityMax = 0) {
    const el = document.createElement("div");
    el.className = "calendar-day";
    if (isOtherMonth) el.classList.add("other-month");
    if (isToday) el.classList.add("today");

    const dayNum = document.createElement("span");
    dayNum.textContent = day;
    el.appendChild(dayNum);

    if (activity) {
        el.classList.add("has-activity");
        el.style.setProperty("--heat-alpha", getCalendarMetricIntensity(activity, state.calendarHeatmapMode, intensityMax).toFixed(2));
        
        const dot = document.createElement("div");
        dot.className = "activity-dot";
        el.appendChild(dot);

        const dist = document.createElement("span");
        dist.className = "distance-label";
        dist.textContent = formatCalendarMetric(activity, state.calendarHeatmapMode);
        el.appendChild(dist);

        el.title = buildCalendarDayTitle(activity);
        el.addEventListener("click", () => {
            // This will be wired to a central 'focusRun' logic in app.js
            window.dispatchEvent(new CustomEvent("stride:focus-run", { detail: { runId: activity.primaryRunId } }));
        });
    }

    return el;
}

function groupActivitiesByDate(runs) {
    const map = new Map();
    runs.forEach((run) => {
        const dateStr = toLocalDateKey(run.startedAt);
        const existing = map.get(dateStr);
        if (!existing) {
            map.set(dateStr, {
                dateStr,
                name: run.name,
                primaryRunId: run.id,
                runCount: 1,
                longestRunKm: run.distanceKm,
                distanceKm: run.distanceKm,
                movingTimeSec: run.movingTimeSec,
                averagePaceSec: run.averagePaceSec,
                averagePaceLabel: run.averagePaceLabel,
                averageHeartrateSum: run.averageHeartrate ?? 0,
                averageHeartrateCount: run.averageHeartrate == null ? 0 : 1,
            });
            return;
        }

        existing.runCount += 1;
        existing.distanceKm += run.distanceKm;
        existing.movingTimeSec += run.movingTimeSec;
        if (run.averageHeartrate != null) {
            existing.averageHeartrateSum += run.averageHeartrate;
            existing.averageHeartrateCount += 1;
        }
        if (run.distanceKm > existing.longestRunKm) {
            existing.primaryRunId = run.id;
            existing.name = run.name;
            existing.longestRunKm = run.distanceKm;
        }
        existing.averagePaceSec = existing.distanceKm > 0 ? existing.movingTimeSec / existing.distanceKm : null;
        existing.averagePaceLabel = formatPaceFromSeconds(existing.averagePaceSec);
    });
    return map;
}

function getCalendarMetricValue(activity, mode) {
    if (!activity) return 0;
    if (mode === "duration") return activity.movingTimeSec / 60;
    if (mode === "pace") return activity.averagePaceSec || 0;
    return activity.distanceKm;
}

function getCalendarMetricMax(activities, mode) {
    const values = activities
        .map((a) => getCalendarMetricValue(a, mode))
        .filter((v) => Number.isFinite(v) && v > 0);
    return values.length === 0 ? 0 : Math.max(...values);
}

function getCalendarMetricMin(activities, mode) {
    const values = activities
        .map((a) => getCalendarMetricValue(a, mode))
        .filter((v) => Number.isFinite(v) && v > 0);
    return values.length === 0 ? 0 : Math.min(...values);
}

function getCalendarMetricIntensity(activity, mode, maxValue) {
    const value = getCalendarMetricValue(activity, mode);
    if (!Number.isFinite(value) || value <= 0 || maxValue <= 0) return 0.16;

    if (mode === "pace") {
        const monthActivities = state.summary
            ? [...groupActivitiesByDate(state.summary.runs).values()].filter((entry) => {
                  const date = new Date(`${entry.dateStr}T00:00:00`);
                  return date.getFullYear() === state.calYear && date.getMonth() === state.calMonth;
              })
            : [];
        const minValue = getCalendarMetricMin(monthActivities, mode);
        const range = Math.max(1, maxValue - minValue);
        const normalized = 1 - Math.min(1, Math.max(0, (value - minValue) / range));
        return 0.2 + normalized * 0.65;
    }

    return 0.2 + Math.min(1, value / maxValue) * 0.65;
}

function formatCalendarMetric(activity, mode) {
    if (mode === "duration") return `${Math.round(activity.movingTimeSec / 60)}m`;
    if (mode === "pace") return formatPaceFromSeconds(activity.averagePaceSec);
    return `${activity.distanceKm.toFixed(1)}k`;
}

function buildCalendarDayTitle(activity) {
    const avgHr = activity.averageHeartrateCount > 0 ? Math.round(activity.averageHeartrateSum / activity.averageHeartrateCount) : null;
    return `${activity.runCount} 次跑步 · ${activity.distanceKm.toFixed(1)} km · ${formatDuration(activity.movingTimeSec)} · ${activity.averagePaceLabel} · HR ${avgHr ?? "--"}`;
}

function buildHeatmapLegendText(mode, maxValue) {
    if (mode === "duration") return `熱力圖: 時間，最深約 ${Math.round(maxValue)} 分鐘`;
    if (mode === "pace") return "熱力圖: 配速，顏色越亮代表越快";
    return `熱力圖: 距離，最深約 ${maxValue.toFixed(1)} km`;
}

export function syncHeatmapModeUi() {
    const heatmapModePills = document.querySelectorAll("[data-heatmap-mode]");
    heatmapModePills?.forEach((button) => {
        const active = button.dataset.heatmapMode === state.calendarHeatmapMode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
    });
}

export function setCalendarHeatmapMode(mode) {
    if (!["distance", "duration", "pace"].includes(mode) || state.calendarHeatmapMode === mode) return;

    state.calendarHeatmapMode = mode;
    localStorage.setItem(STORAGE_KEYS.calendarHeatmapMode, mode);
    syncHeatmapModeUi();

    if (state.summary) {
        renderCalendar(state.summary.runs);
    }
}
