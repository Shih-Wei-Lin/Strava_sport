import { toNumber, average, median } from './utils/math.js';
import {
    startOfDay,
    startOfWeek,
    startOfMonth,
    formatDistance,
    formatDuration,
    formatPaceFromSeconds,
    formatPaceFromSpeed,
    formatCompactDuration,
    formatShortDate,
    parseStravaLocalDate,
    formatDeltaPace,
    normaliseActivity,
    escapeHtml,
    toLocalDateKey
} from './utils/format.js';
import {
    calculateVdot,
    calculateRiegelTime,
    predictTimeFromVdot,
    buildAbilityPrediction,
    buildHeartRateZoneSummary,
    buildActivityZoneSummary
} from './models/physio.js';
import {
    getSplitTimeSec,
    calculateBestSegmentEffort,
    mergeBestEffort
} from './analytics/segments.js';
import {
    buildAdvancedMetrics,
    buildTrainingDistributionMetrics,
    buildTrendInsight,
    buildWeeklyTrend,
    buildConsistencyScore,
    buildPaceTrend,
    selectComparableRuns
} from './analytics/trends.js';

import { detectIntervals } from './analytics/intervals.js';
import { analyzeWeatherImpact } from './analytics/weather.js';

export {
    toNumber,
    average,
    median,
    startOfDay,
    startOfWeek,
    startOfMonth,
    formatDistance,
    formatDuration,
    formatPaceFromSeconds,
    formatPaceFromSpeed,
    formatCompactDuration,
    formatShortDate,
    parseStravaLocalDate,
    formatDeltaPace,
    normaliseActivity,
    calculateVdot,
    calculateRiegelTime,
    predictTimeFromVdot,
    buildAbilityPrediction,
    detectIntervals,
    analyzeWeatherImpact,
    buildHeartRateZoneSummary,
    buildActivityZoneSummary,
    getSplitTimeSec,
    calculateBestSegmentEffort,
    mergeBestEffort,
    buildAdvancedMetrics,
    buildTrainingDistributionMetrics,
    buildTrendInsight,
    buildWeeklyTrend,
    buildConsistencyScore,
    buildPaceTrend,
    selectComparableRuns,
    escapeHtml,
    toLocalDateKey
};

// Internal constants and helper functions still needed for summariseActivities if not moved
const ONE_K_MIN = 0.95;
const ONE_K_MAX = 1.1;
const THREE_K_MIN = 2.8;
const THREE_K_MAX = 3.3;
const FIVE_K_MIN = 4.8;
const FIVE_K_MAX = 5.3;
const TEN_K_MIN = 9.5;
const TEN_K_MAX = 10.5;
const FULL_RUN_TARGETS = [
    ["fullRun1k", ONE_K_MIN, ONE_K_MAX],
    ["fullRun3k", THREE_K_MIN, THREE_K_MAX],
    ["fullRun5k", FIVE_K_MIN, FIVE_K_MAX],
    ["fullRun10k", TEN_K_MIN, TEN_K_MAX],
];

function isBetterFullRunEffort(candidate, current) {
    if (current == null) return true;
    if (candidate.movingTimeSec !== current.movingTimeSec) {
        return candidate.movingTimeSec < current.movingTimeSec;
    }

    return candidate.averagePaceSec < current.averagePaceSec;
}

function updateBestFullRunEfforts(bests, run) {
    FULL_RUN_TARGETS.forEach(([key, minDistance, maxDistance]) => {
        if (run.distanceKm < minDistance || run.distanceKm > maxDistance) return;
        if (isBetterFullRunEffort(run, bests[key])) bests[key] = run;
    });
}

export function summariseActivities(activities, now = new Date()) {
    const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);
    const runs = (Array.isArray(activities) ? activities : [])
        .filter((activity) => (RUN_TYPES.has(activity.type) || RUN_TYPES.has(activity.sport_type)) && activity.distance > 0)
        .map((activity) => normaliseActivity(activity))
        .sort((left, right) => (right.startedAt?.getTime() || 0) - (left.startedAt?.getTime() || 0));

    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);
    const sevenDaysAgo = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
    const recentFullEffortsStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const recentWindow = runs.slice(0, 4);
    const recentFullEfforts = [];
    const bests = {
        fullRun1k: null,
        fullRun3k: null,
        fullRun5k: null,
        fullRun10k: null,
    };
    let weekDistanceKm = 0;
    let weekCount = 0;
    let monthDistanceKm = 0;
    let monthCount = 0;
    let recentSevenDayDistanceKm = 0;
    let longestRun = null;

    runs.forEach((run) => {
        if (run.startedAt >= weekStart) {
            weekDistanceKm += run.distanceKm;
            weekCount += 1;
        }

        if (run.startedAt >= monthStart) {
            monthDistanceKm += run.distanceKm;
            monthCount += 1;
        }

        if (run.startedAt >= sevenDaysAgo) {
            recentSevenDayDistanceKm += run.distanceKm;
        }

        if (run.startedAt >= recentFullEffortsStart) {
            recentFullEfforts.push(run);
        }

        if (longestRun == null || run.distanceKm > longestRun.distanceKm) {
            longestRun = run;
        }

        updateBestFullRunEfforts(bests, run);
    });

    const prediction = buildAbilityPrediction([
        bests.fullRun3k,
        bests.fullRun5k,
        bests.fullRun10k,
        ...recentFullEfforts.filter((run) => run.distanceKm >= 3 && run.distanceKm <= 21.1).slice(0, 16),
    ]);
    const advanced = buildAdvancedMetrics(runs, now);
    const distribution = buildTrainingDistributionMetrics(runs, now);

    return {
        runs,
        totals: {
            weekDistanceKm: Number(weekDistanceKm.toFixed(1)),
            weekCount,
            monthDistanceKm: Number(monthDistanceKm.toFixed(1)),
            monthCount,
            recentAveragePaceSec: average(recentWindow.map((run) => run.averagePaceSec)),
            recentAverageHr: average(recentWindow.map((run) => run.averageHeartrate)),
            recentSevenDayDistanceKm: Number(recentSevenDayDistanceKm.toFixed(1)),
            longestRunKm: longestRun ? Number(longestRun.distanceKm.toFixed(1)) : 0,
            consistencyScore: buildConsistencyScore(runs, now),
            acuteChronicRatio: advanced.acuteChronicRatio,
            efficiencyIndex: advanced.efficiencyIndex,
            recentCadence: advanced.recentCadence,
            elevationPerKm: advanced.elevationPerKm,
            averageRunDistanceKm: distribution.averageDistanceKm,
            averageRunDurationSec: distribution.averageDurationSec,
            qualityRunRatio: distribution.qualityRunRatio,
            hrDeltaBpm: distribution.hrDeltaBpm,
            longRunSharePercent: distribution.longRunSharePercent,
        },
        bests: {
            fullRun1k: bests.fullRun1k,
            fullRun3k: bests.fullRun3k,
            fullRun5k: bests.fullRun5k,
            fullRun10k: bests.fullRun10k,
            segment1k: null,
            segment3k: null,
            segment5k: null,
            segment10k: null,
        },
        weeklyTrend: buildWeeklyTrend(runs, now),
        insight: buildTrendInsight(runs),
        prediction,
    };
}
