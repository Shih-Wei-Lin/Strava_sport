import { toNumber, average, median } from '../utils/math.js';
import { startOfDay, startOfWeek } from '../utils/format.js';

function sumDistance(runs) {
    return runs.reduce((total, run) => total + run.distanceKm, 0);
}

export function buildWeeklyTrend(runs, now, weeks = 12) {
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

export function buildConsistencyScore(runs, now) {
    const twentyEightDaysAgo = startOfDay(new Date(now.getTime() - 27 * 24 * 60 * 60 * 1000));
    const activeDays = new Set(
        runs
            .filter((run) => run.startedAt >= twentyEightDaysAgo)
            .map((run) => startOfDay(run.startedAt).toISOString().slice(0, 10)),
    );

    return `${Math.round((activeDays.size / 28) * 100)}%`;
}

export function buildAdvancedMetrics(runs, now) {
    const recentWindow = runs.slice(0, 6);
    const sevenDaysAgo = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
    const twentyEightDaysAgo = startOfDay(new Date(now.getTime() - 27 * 24 * 60 * 60 * 1000));

    const acuteRuns = runs.filter((run) => run.startedAt >= sevenDaysAgo);
    const chronicRuns = runs.filter((run) => run.startedAt >= twentyEightDaysAgo);
    const acuteLoadKm = sumDistance(acuteRuns);
    const chronicWeeklyAvgKm = sumDistance(chronicRuns) / 4;
    const acwr = chronicWeeklyAvgKm > 0 ? acuteLoadKm / chronicWeeklyAvgKm : null;

    const efficiencyPairs = recentWindow
        .filter((run) => Number.isFinite(run.averageSpeed) && Number.isFinite(run.averageHeartrate) && run.averageHeartrate > 0)
        .map((run) => (run.averageSpeed * 100) / run.averageHeartrate);

    const totalDistance = sumDistance(recentWindow);
    const totalElevation = recentWindow.reduce((sum, run) => sum + toNumber(run.elevationGain), 0);

    return {
        acuteChronicRatio: acwr == null ? null : Number(acwr.toFixed(2)),
        efficiencyIndex: average(efficiencyPairs),
        recentCadence: average(recentWindow.map((run) => run.cadence)),
        elevationPerKm: totalDistance > 0 ? totalElevation / totalDistance : null,
    };
}

export function buildTrainingDistributionMetrics(runs, now) {
    const twentyEightDaysAgo = startOfDay(new Date(now.getTime() - 27 * 24 * 60 * 60 * 1000));
    const monthRuns = runs.filter((run) => run.startedAt >= twentyEightDaysAgo);
    const recentRuns = runs.slice(0, 4);
    const previousRuns = runs.slice(4, 8);

    const averageDistanceKm = average(monthRuns.map((run) => run.distanceKm));
    const averageDurationSec = average(monthRuns.map((run) => run.movingTimeSec));
    const medianPace = median(monthRuns.map((run) => run.averagePaceSec));
    const qualityRuns =
        medianPace == null
            ? []
            : monthRuns.filter((run) => Number.isFinite(run.averagePaceSec) && run.averagePaceSec <= medianPace * 0.97);
    const qualityRunRatio = monthRuns.length > 0 ? (qualityRuns.length / monthRuns.length) * 100 : null;

    const recentHr = average(recentRuns.map((run) => run.averageHeartrate));
    const previousHr = average(previousRuns.map((run) => run.averageHeartrate));
    const hrDeltaBpm = recentHr != null && previousHr != null ? recentHr - previousHr : null;

    const totalDistance = sumDistance(monthRuns);
    const longestRun = monthRuns.reduce((best, run) => (best == null || run.distanceKm > best.distanceKm ? run : best), null);
    const longRunSharePercent = totalDistance > 0 && longestRun ? (longestRun.distanceKm / totalDistance) * 100 : null;

    return {
        averageDistanceKm,
        averageDurationSec,
        qualityRunRatio,
        hrDeltaBpm,
        longRunSharePercent,
    };
}

export function selectComparableRuns(runs) {
    const candidates = runs.filter(
        (run) =>
            Number.isFinite(run.averagePaceSec) &&
            run.distanceKm >= 4 &&
            run.distanceKm <= 18 &&
            run.movingTimeSec >= 20 * 60,
    );

    if (candidates.length < 4) {
        return { recent: [], previous: [], referenceDistanceKm: null };
    }

    const seedRuns = candidates.slice(0, Math.min(6, candidates.length));
    let bestGroup = { recent: [], previous: [], referenceDistanceKm: null, totalComparable: -1 };

    seedRuns.forEach((seedRun) => {
        const referenceDistanceKm = seedRun.distanceKm;
        const comparable = candidates.filter(
            (run) => Math.abs(run.distanceKm - referenceDistanceKm) / referenceDistanceKm <= 0.2,
        );
        const windowSize = Math.min(4, Math.floor(comparable.length / 2));

        const group = {
            recent: comparable.slice(0, windowSize),
            previous: comparable.slice(windowSize, windowSize * 2),
            referenceDistanceKm,
            totalComparable: comparable.length,
        };

        const currentScore = Math.min(group.recent.length, group.previous.length);
        const bestScore = Math.min(bestGroup.recent.length, bestGroup.previous.length);

        if (
            currentScore > bestScore ||
            (currentScore === bestScore && group.totalComparable > bestGroup.totalComparable)
        ) {
            bestGroup = group;
        }
    });

    return bestGroup;
}

export function buildPaceTrend(runs) {
    const { recent, previous, referenceDistanceKm } = selectComparableRuns(runs);

    if (recent.length < 2 || previous.length < 2) {
        return {
            paceDeltaSec: null,
            referenceDistanceKm,
            recentCount: recent.length,
            previousCount: previous.length,
        };
    }

    const recentMedian = median(recent.map((run) => run.averagePaceSec));
    const previousMedian = median(previous.map((run) => run.averagePaceSec));

    return {
        paceDeltaSec: recentMedian != null && previousMedian != null ? Math.round(recentMedian - previousMedian) : null,
        referenceDistanceKm: Number(referenceDistanceKm.toFixed(1)),
        recentCount: recent.length,
        previousCount: previous.length,
    };
}

export function buildTrendInsight(runs) {
    if (runs.length === 0) {
        return {
            headline: "尚未取得跑步資料",
            summary: "完成 Strava 授權後，這裡會根據近期跑量、配速與心率變化提供摘要。",
            paceDeltaSec: null,
            paceReferenceKm: null,
        };
    }

    const recentRuns = runs.slice(0, 4);
    const previousRuns = runs.slice(4, 8);
    const recentDistance = sumDistance(recentRuns);
    const previousDistance = sumDistance(previousRuns);
    const distanceDelta = Number((recentDistance - previousDistance).toFixed(1));
    const recentHr = average(recentRuns.map((run) => run.averageHeartrate));
    const previousHr = average(previousRuns.map((run) => run.averageHeartrate));
    const hrDelta =
        recentHr != null && previousHr != null ? Math.round(recentHr - previousHr) : null;
    const paceTrend = buildPaceTrend(runs);

    let headline = "近期訓練量與節奏大致穩定";
    let summary = `最近 ${recentRuns.length} 次跑步累積 ${recentDistance.toFixed(1)} km。`;

    if (paceTrend.paceDeltaSec != null && paceTrend.referenceDistanceKm != null) {
        if (paceTrend.paceDeltaSec <= -8 && (hrDelta == null || hrDelta <= 3)) {
            headline = "近期同距離配速有進步";
            summary = `以 ${paceTrend.referenceDistanceKm.toFixed(1)} km 左右的活動比較，近期中位配速比前一期快 ${Math.abs(
                paceTrend.paceDeltaSec,
            )} 秒/km。`;
        } else if (paceTrend.paceDeltaSec >= 8 && (hrDelta == null || hrDelta >= 2)) {
            headline = "近期同距離配速有下滑";
            summary = `以 ${paceTrend.referenceDistanceKm.toFixed(1)} km 左右的活動比較，近期中位配速慢了 ${paceTrend.paceDeltaSec} 秒/km。`;
        }
    }

    if (distanceDelta >= 10) {
        headline = "跑量拉升中，近期負荷增加";
        summary = `最近 4 次跑步比前 4 次多了 ${distanceDelta.toFixed(1)} km，建議注意恢復。`;
    } else if (distanceDelta <= -10) {
        headline = "近期像是回收週";
        summary = `最近 4 次跑步比前 4 次少了 ${Math.abs(distanceDelta).toFixed(1)} km。`;
    }

    return {
        headline,
        summary,
        paceDeltaSec: paceTrend.paceDeltaSec,
        paceReferenceKm: paceTrend.referenceDistanceKm,
    };
}
