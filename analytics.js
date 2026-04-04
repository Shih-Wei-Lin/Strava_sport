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

function pickBestFullRunEffort(runs, minDistance, maxDistance) {
    const candidates = runs.filter((run) => run.distanceKm >= minDistance && run.distanceKm <= maxDistance);
    if (candidates.length === 0) {
        return null;
    }

    return [...candidates].sort((left, right) => {
        if (left.movingTimeSec !== right.movingTimeSec) {
            return left.movingTimeSec - right.movingTimeSec;
        }

        return left.averagePaceSec - right.averagePaceSec;
    })[0];
}

function sumDistance(runs) {
    return runs.reduce((total, run) => total + run.distanceKm, 0);
}

export function summariseActivities(activities, now = new Date()) {
    const runs = (Array.isArray(activities) ? activities : [])
        .filter((activity) => (activity.type === "Run" || activity.sport_type === "Run") && activity.distance > 0)
        .map((activity) => normaliseActivity(activity))
        .sort((left, right) => (right.startedAt?.getTime() || 0) - (left.startedAt?.getTime() || 0));

    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);
    const sevenDaysAgo = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
    const recentWindow = runs.slice(0, 4);
    const recentFullEfforts = runs.filter(
        (run) => run.startedAt >= new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000),
    );
    const weekRuns = runs.filter((run) => run.startedAt >= weekStart);
    const monthRuns = runs.filter((run) => run.startedAt >= monthStart);
    const recentSevenDayRuns = runs.filter((run) => run.startedAt >= sevenDaysAgo);
    const longestRun = runs.reduce((best, run) => (best == null || run.distanceKm > best.distanceKm ? run : best), null);

    const fullRun5k = pickBestFullRunEffort(runs, FIVE_K_MIN, FIVE_K_MAX);
    const fullRun10k = pickBestFullRunEffort(runs, TEN_K_MIN, TEN_K_MAX);
    const fullRun1k = pickBestFullRunEffort(runs, ONE_K_MIN, ONE_K_MAX);
    const fullRun3k = pickBestFullRunEffort(runs, THREE_K_MIN, THREE_K_MAX);
    const prediction = buildAbilityPrediction([
        fullRun3k,
        fullRun5k,
        fullRun10k,
        ...recentFullEfforts.filter((run) => run.distanceKm >= 3 && run.distanceKm <= 21.1).slice(0, 16),
    ]);
    const advanced = buildAdvancedMetrics(runs, now);
    const distribution = buildTrainingDistributionMetrics(runs, now);

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
            fullRun1k,
            fullRun3k,
            fullRun5k,
            fullRun10k,
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
