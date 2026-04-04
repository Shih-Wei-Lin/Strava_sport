import { toNumber } from '../utils/math.js';
import { formatDuration, formatPaceFromSeconds } from '../utils/format.js';

export function getSplitTimeSec(split) {
    if (Number.isFinite(split.moving_time)) {
        return split.moving_time;
    }

    if (Number.isFinite(split.elapsed_time)) {
        return split.elapsed_time;
    }

    if (Number.isFinite(split.distance) && Number.isFinite(split.average_speed) && split.average_speed > 0) {
        return split.distance / split.average_speed;
    }

    return null;
}

export function calculateBestSegmentEffort(run, splitsMetric, targetDistanceKm) {
    if (!run || !Array.isArray(splitsMetric) || splitsMetric.length === 0) {
        return null;
    }

    const targetMeters = targetDistanceKm * 1000;
    const segments = splitsMetric
        .map((split, index) => {
            const distanceMeters = toNumber(split.distance, 0);
            const timeSec = getSplitTimeSec(split);
            if (distanceMeters <= 0 || !Number.isFinite(timeSec) || timeSec <= 0) {
                return null;
            }

            return {
                index,
                distanceMeters,
                timeSec,
                averageHeartrate: (split.average_heartrate != null && Number.isFinite(split.average_heartrate)) ? toNumber(split.average_heartrate, NaN) : null,
                elevationDifference: toNumber(split.elevation_difference, 0),
            };
        })
        .filter(Boolean);

    if (segments.length === 0) {
        return null;
    }

    let best = null;

    for (let startIndex = 0; startIndex < segments.length; startIndex += 1) {
        let coveredMeters = 0;
        let totalTimeSec = 0;
        let weightedHr = 0;
        let hrCoveredMeters = 0;
        let totalElevation = 0;

        for (let endIndex = startIndex; endIndex < segments.length; endIndex += 1) {
            const split = segments[endIndex];
            const metersNeeded = targetMeters - coveredMeters;
            const takeMeters = Math.min(split.distanceMeters, metersNeeded);
            const ratio = takeMeters / split.distanceMeters;

            coveredMeters += takeMeters;
            totalTimeSec += split.timeSec * ratio;
            totalElevation += split.elevationDifference * ratio;

            if (Number.isFinite(split.averageHeartrate)) {
                weightedHr += split.averageHeartrate * takeMeters;
                hrCoveredMeters += takeMeters;
            }

            if (coveredMeters + 0.5 >= targetMeters) {
                const startKm = segments
                    .slice(0, startIndex)
                    .reduce((sum, segment) => sum + segment.distanceMeters, 0) / 1000;
                const endKm = startKm + targetDistanceKm;
                const averageHeartrate = hrCoveredMeters > 0 ? Math.round(weightedHr / hrCoveredMeters) : null;

                const candidate = {
                    id: `${run.id}-segment-${targetDistanceKm}-${startIndex}-${endIndex}`,
                    runId: run.id,
                    runName: run.name,
                    name: `${run.name} · 最佳 ${targetDistanceKm}K 區段`,
                    dateLabel: run.dateLabel,
                    startedAt: run.startedAt,
                    distanceKm: targetDistanceKm,
                    movingTimeSec: totalTimeSec,
                    movingTimeLabel: formatDuration(totalTimeSec),
                    averagePaceSec: totalTimeSec / targetDistanceKm,
                    averagePaceLabel: formatPaceFromSeconds(totalTimeSec / targetDistanceKm),
                    averageHeartrate,
                    elevationGain: totalElevation,
                    source: "segment",
                    splitRangeLabel: `${startKm.toFixed(1)}K-${endKm.toFixed(1)}K`,
                };

                if (!best || candidate.movingTimeSec < best.movingTimeSec) {
                    best = candidate;
                }

                break;
            }
        }
    }

    return best;
}

export function mergeBestEffort(currentBest, candidate) {
    if (!candidate) {
        return currentBest;
    }

    if (!currentBest || candidate.movingTimeSec < currentBest.movingTimeSec) {
        return candidate;
    }

    return currentBest;
}
