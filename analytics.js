const FIVE_K_MIN = 4.8;
const FIVE_K_MAX = 5.3;
const TEN_K_MIN = 9.5;
const TEN_K_MAX = 10.5;

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfWeek(date) {
    const start = startOfDay(date);
    const day = start.getDay();
    const shift = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + shift);
    return start;
}

export function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function formatDistance(km) {
    return `${toNumber(km).toFixed(1)} km`;
}

export function formatDuration(seconds) {
    const totalSeconds = Math.max(0, Math.round(toNumber(seconds)));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    return `${minutes}m ${secs.toString().padStart(2, "0")}s`;
}

export function formatPaceFromSeconds(secondsPerKm) {
    const safe = toNumber(secondsPerKm, NaN);
    if (!Number.isFinite(safe) || safe <= 0) {
        return "--";
    }

    const minutes = Math.floor(safe / 60);
    const seconds = Math.round(safe % 60);
    return `${minutes}'${seconds.toString().padStart(2, "0")}/km`;
}

export function formatPaceFromSpeed(speedMetersPerSecond) {
    const speed = toNumber(speedMetersPerSecond, NaN);
    if (!Number.isFinite(speed) || speed <= 0) {
        return "--";
    }

    return formatPaceFromSeconds(1000 / speed);
}

export function formatShortDate(dateInput) {
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) {
        return "未知日期";
    }

    return date.toLocaleDateString("zh-TW", {
        month: "short",
        day: "numeric",
        weekday: "short",
    });
}

export function normaliseActivity(activity) {
    const startedAt = new Date(activity.start_date_local || activity.start_date || Date.now());
    const distanceKm = toNumber(activity.distance) / 1000;
    const movingTimeSec = toNumber(activity.moving_time);
    const averageSpeed = toNumber(activity.average_speed, NaN);
    const averageHeartrate = activity.average_heartrate == null ? null : Math.round(toNumber(activity.average_heartrate, NaN));
    const elevationGain = toNumber(activity.total_elevation_gain);
    const paceSecPerKm = distanceKm > 0 ? movingTimeSec / distanceKm : null;

    return {
        id: String(activity.id ?? cryptoRandomId()),
        name: activity.name || "未命名跑步",
        type: activity.type || activity.sport_type || "Run",
        startedAt,
        dateLabel: formatShortDate(startedAt),
        distanceKm,
        movingTimeSec,
        movingTimeLabel: formatDuration(movingTimeSec),
        averageSpeed,
        averagePaceSec: paceSecPerKm,
        averagePaceLabel: formatPaceFromSeconds(paceSecPerKm),
        averageHeartrate,
        elevationGain,
        calories: activity.calories == null ? null : Math.round(toNumber(activity.calories)),
        cadence: activity.average_cadence == null ? null : Number(toNumber(activity.average_cadence).toFixed(1)),
    };
}

function cryptoRandomId() {
    return `fallback-${Math.random().toString(36).slice(2, 10)}`;
}

function average(values) {
    const filtered = values.filter((value) => Number.isFinite(value));
    if (filtered.length === 0) {
        return null;
    }

    return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function pickBestEffort(runs, minDistance, maxDistance) {
    const candidates = runs.filter((run) => run.distanceKm >= minDistance && run.distanceKm <= maxDistance);
    if (candidates.length === 0) {
        return null;
    }

    return [...candidates].sort((left, right) => {
        if (left.movingTimeSec !== right.movingTimeSec) {
            return left.movingTimeSec - right.movingTimeSec;
        }

        return Math.abs(left.distanceKm - minDistance) - Math.abs(right.distanceKm - minDistance);
    })[0];
}

function sumDistance(runs) {
    return runs.reduce((total, run) => total + run.distanceKm, 0);
}

function buildWeeklyTrend(runs, now, weeks = 6) {
    const currentWeek = startOfWeek(now);
    const buckets = [];

    for (let offset = weeks - 1; offset >= 0; offset -= 1) {
        const weekStart = new Date(currentWeek);
        weekStart.setDate(weekStart.getDate() - offset * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const bucketRuns = runs.filter((run) => run.startedAt >= weekStart && run.startedAt < weekEnd);
        buckets.push({
            label: `${weekStart.getMonth() + 1}/${weekStart.getDate()}`,
            weekStart,
            distanceKm: Number(sumDistance(bucketRuns).toFixed(1)),
            runCount: bucketRuns.length,
        });
    }

    return buckets;
}

function buildConsistencyScore(runs, now) {
    const twentyEightDaysAgo = startOfDay(new Date(now.getTime() - 27 * 24 * 60 * 60 * 1000));
    const activeDays = new Set(
        runs
            .filter((run) => run.startedAt >= twentyEightDaysAgo)
            .map((run) => startOfDay(run.startedAt).toISOString().slice(0, 10)),
    );
    const score = Math.round((activeDays.size / 28) * 100);
    return `${score}%`;
}

function buildTrendInsight(recentRuns, previousRuns) {
    if (recentRuns.length === 0) {
        return {
            headline: "尚未取得跑步資料",
            summary: "完成 Strava 授權後，這裡會根據近期跑量、配速與心率變化提供摘要。",
            paceDeltaSec: null,
        };
    }

    const recentPace = average(recentRuns.map((run) => run.averagePaceSec));
    const previousPace = average(previousRuns.map((run) => run.averagePaceSec));
    const recentHr = average(recentRuns.map((run) => run.averageHeartrate));
    const previousHr = average(previousRuns.map((run) => run.averageHeartrate));
    const recentDistance = sumDistance(recentRuns);
    const previousDistance = sumDistance(previousRuns);

    const paceDeltaSec =
        recentPace != null && previousPace != null ? Math.round(recentPace - previousPace) : null;
    const hrDelta =
        recentHr != null && previousHr != null ? Math.round(recentHr - previousHr) : null;
    const distanceDelta = Number((recentDistance - previousDistance).toFixed(1));

    let headline = "近期節奏維持穩定";
    let summary = `最近 ${recentRuns.length} 次跑步累積 ${recentDistance.toFixed(1)} km。`;

    if (paceDeltaSec != null && hrDelta != null) {
        if (paceDeltaSec <= -6 && hrDelta <= 2) {
            headline = "近期狀態有往上走";
            summary = `平均配速比前一個區段快 ${Math.abs(paceDeltaSec)} 秒/km，心率變化不大，代表效率有改善。`;
        } else if (paceDeltaSec >= 8 && hrDelta >= 4) {
            headline = "近期負荷偏高，恢復要留意";
            summary = `平均配速慢了 ${paceDeltaSec} 秒/km，心率卻上升 ${hrDelta} bpm，可能有疲勞累積。`;
        } else if (distanceDelta >= 10) {
            headline = "跑量拉升中，節奏控制正常";
            summary = `近期比前一個區段多跑了 ${distanceDelta.toFixed(1)} km，配速與心率沒有明顯惡化。`;
        } else if (distanceDelta <= -10) {
            headline = "近期屬於回收週";
            summary = `近期跑量減少 ${Math.abs(distanceDelta).toFixed(1)} km，可視為主動恢復或訓練間歇。`;
        }
    }

    return { headline, summary, paceDeltaSec };
}

export function summariseActivities(activities, now = new Date()) {
    const runs = activities
        .filter((activity) => activity.type === "Run" || activity.sport_type === "Run")
        .map((activity) => normaliseActivity(activity))
        .sort((left, right) => right.startedAt - left.startedAt);

    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);
    const sevenDaysAgo = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
    const weekRuns = runs.filter((run) => run.startedAt >= weekStart);
    const monthRuns = runs.filter((run) => run.startedAt >= monthStart);
    const recentWindow = runs.slice(0, 4);
    const previousWindow = runs.slice(4, 8);
    const recentSevenDayRuns = runs.filter((run) => run.startedAt >= sevenDaysAgo);
    const longestRun = runs.reduce((best, run) => (best == null || run.distanceKm > best.distanceKm ? run : best), null);
    const weeklyTrend = buildWeeklyTrend(runs, now);
    const insight = buildTrendInsight(recentWindow, previousWindow);

    return {
        runs,
        totals: {
            weekDistanceKm: Number(sumDistance(weekRuns).toFixed(1)),
            weekCount: weekRuns.length,
            monthDistanceKm: Number(sumDistance(monthRuns).toFixed(1)),
            monthCount: monthRuns.length,
            recentAveragePaceSec: average(recentWindow.map((run) => run.averagePaceSec)),
            recentAverageHr: average(recentWindow.map((run) => run.averageHeartrate)),
            recentSevenDayDistanceKm: Number(sumDistance(recentSevenDayRuns).toFixed(1)),
            longestRunKm: longestRun ? Number(longestRun.distanceKm.toFixed(1)) : 0,
            consistencyScore: buildConsistencyScore(runs, now),
        },
        bests: {
            run5k: pickBestEffort(runs, FIVE_K_MIN, FIVE_K_MAX),
            run10k: pickBestEffort(runs, TEN_K_MIN, TEN_K_MAX),
        },
        weeklyTrend,
        insight,
    };
}
