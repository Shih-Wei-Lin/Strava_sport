import { toNumber } from '../utils/math.js';
import { formatDuration } from '../utils/format.js';

const DEFAULT_FIXED_MAX_HEARTRATE = 190;
const PREDICTION_DISTANCES = {
    "5K": 5000,
    "10K": 10000,
    "Half": 21097.5,
    "Marathon": 42195,
};

export function calculateVdot(distanceMeters, timeSeconds) {
    const distance = toNumber(distanceMeters, NaN);
    const seconds = toNumber(timeSeconds, NaN);
    if (!Number.isFinite(distance) || !Number.isFinite(seconds) || distance <= 0 || seconds <= 0) {
        return null;
    }

    const timeMinutes = seconds / 60;
    const velocity = distance / timeMinutes;
    const vo2 = -4.6 + 0.182258 * velocity + 0.000104 * velocity * velocity;
    const percentMax =
        0.8 +
        0.1894393 * Math.exp(-0.012778 * timeMinutes) +
        0.2989558 * Math.exp(-0.1932605 * timeMinutes);

    if (!Number.isFinite(percentMax) || percentMax <= 0) {
        return null;
    }

    return vo2 / percentMax;
}

export function calculateRiegelTime(baseTimeSeconds, baseDistanceMeters, targetDistanceMeters, exponent = 1.06) {
    const baseTime = toNumber(baseTimeSeconds, NaN);
    const baseDistance = toNumber(baseDistanceMeters, NaN);
    const targetDistance = toNumber(targetDistanceMeters, NaN);
    if (!Number.isFinite(baseTime) || !Number.isFinite(baseDistance) || !Number.isFinite(targetDistance)) {
        return null;
    }

    if (baseTime <= 0 || baseDistance <= 0 || targetDistance <= 0) {
        return null;
    }

    return baseTime * (targetDistance / baseDistance) ** exponent;
}

export function predictTimeFromVdot(vdot, targetDistanceMeters) {
    const targetDistance = toNumber(targetDistanceMeters, NaN);
    const targetVdot = toNumber(vdot, NaN);
    if (!Number.isFinite(targetDistance) || !Number.isFinite(targetVdot) || targetDistance <= 0 || targetVdot <= 0) {
        return null;
    }

    let low = 3 * 60;
    let high = 6 * 60 * 60;

    for (let iteration = 0; iteration < 60; iteration += 1) {
        const mid = (low + high) / 2;
        const estimatedVdot = calculateVdot(targetDistance, mid);
        if (estimatedVdot == null) {
            return null;
        }

        if (estimatedVdot > targetVdot) {
            low = mid;
        } else {
            high = mid;
        }
    }

    return high;
}

export function buildAbilityPrediction(efforts) {
    const validEfforts = efforts
        .filter(Boolean)
        .map((effort) => {
            const vdot = calculateVdot(effort.distanceKm * 1000, effort.movingTimeSec);
            return vdot == null ? null : { ...effort, vdot };
        })
        .filter(Boolean)
        .filter((effort) => effort.distanceKm >= 3 && effort.distanceKm <= 21.1 && effort.movingTimeSec >= 10 * 60);

    if (validEfforts.length === 0) {
        return null;
    }

    const anchor = [...validEfforts].sort((left, right) => right.vdot - left.vdot)[0];
    const predictions = Object.fromEntries(
        Object.entries(PREDICTION_DISTANCES).map(([label, distanceMeters]) => {
            const vdotTimeSec = predictTimeFromVdot(anchor.vdot, distanceMeters);
            const riegelTimeSec = calculateRiegelTime(anchor.movingTimeSec, anchor.distanceKm * 1000, distanceMeters);
            return [
                label,
                {
                    vdotTimeSec,
                    vdotTimeLabel: formatDuration(vdotTimeSec),
                    riegelTimeSec,
                    riegelTimeLabel: formatDuration(riegelTimeSec),
                },
            ];
        }),
    );

    return {
        model: "VDOT",
        vdot: Number(anchor.vdot.toFixed(1)),
        anchor,
        predictions,
        caution:
            anchor.distanceKm < 8
                ? "預測基準來自較短距離表現，半馬與全馬只能當能力上限參考。"
                : "預測基準接近比賽距離，10K 內通常較穩，半馬以上仍要看耐力準備。",
    };
}

export function buildHeartRateZoneSummary(streams, detail = null, options = {}) {
    const heartrateSamples = Array.isArray(streams?.heartrate?.data) ? streams.heartrate.data : [];
    if (heartrateSamples.length === 0) {
        return null;
    }

    const validHrSamples = heartrateSamples
        .map((value) => toNumber(value, NaN))
        .filter((value) => Number.isFinite(value) && value > 0);
    if (validHrSamples.length === 0) {
        return null;
    }

    const timeSamples = Array.isArray(streams?.time?.data) ? streams.time.data : [];
    const zoneRanges = Array.isArray(options.zoneRanges) ? options.zoneRanges : null;
    const referenceMaxHr = toNumber(options.maxHr, DEFAULT_FIXED_MAX_HEARTRATE);
    const restingHr = toNumber(options.restingHr, 0);
    const useHrr = restingHr > 0 && referenceMaxHr > restingHr;

    if (!zoneRanges && (!Number.isFinite(referenceMaxHr) || referenceMaxHr <= 0)) {
        return null;
    }

    const totalMovingTimeSec = toNumber(detail?.moving_time, 0);
    const sampleFallbackSeconds =
        heartrateSamples.length > 1 ? totalMovingTimeSec / heartrateSamples.length : totalMovingTimeSec;

    const zoneDefs = useHrr
        ? [
              { key: "z1", label: "Z1", minRatio: 0.5, maxRatio: 0.6 },
              { key: "z2", label: "Z2", minRatio: 0.6, maxRatio: 0.7 },
              { key: "z3", label: "Z3", minRatio: 0.7, maxRatio: 0.8 },
              { key: "z4", label: "Z4", minRatio: 0.8, maxRatio: 0.9 },
              { key: "z5", label: "Z5", minRatio: 0.9, maxRatio: 1.0 },
          ]
        : zoneRanges?.length
          ? zoneRanges.map((zone, index) => ({
                key: `z${index + 1}`,
                label: `Z${index + 1}`,
                min: toNumber(zone.min, 0),
                max: Number.isFinite(toNumber(zone.max, NaN)) ? toNumber(zone.max, NaN) : Infinity,
            }))
          : [
                { key: "z1", label: "Z1", minRatio: 0, maxRatio: 0.6 },
                { key: "z2", label: "Z2", minRatio: 0.6, maxRatio: 0.7 },
                { key: "z3", label: "Z3", minRatio: 0.7, maxRatio: 0.8 },
                { key: "z4", label: "Z4", minRatio: 0.8, maxRatio: 0.9 },
                { key: "z5", label: "Z5", minRatio: 0.9, maxRatio: Infinity },
            ];
    const zoneTotals = new Map(zoneDefs.map((zone) => [zone.key, 0]));

    const getHrrValue = (ratio) => (referenceMaxHr - restingHr) * ratio + restingHr;

    heartrateSamples.forEach((sample, index) => {
        const hr = toNumber(sample, NaN);
        if (!Number.isFinite(hr) || hr <= 0) {
            return;
        }

        let durationSec = sampleFallbackSeconds;
        if (timeSamples.length === heartrateSamples.length) {
            if (index < timeSamples.length - 1) {
                durationSec = Math.max(0, toNumber(timeSamples[index + 1], 0) - toNumber(timeSamples[index], 0));
            } else {
                durationSec = 0;
            }
        }

        const zone = useHrr
            ? zoneDefs.find((entry) => {
                  const minHr = getHrrValue(entry.minRatio);
                  const maxHr = getHrrValue(entry.maxRatio);
                  return hr >= minHr && hr < maxHr;
              }) || zoneDefs[zoneDefs.length - 1]
            : zoneRanges?.length
              ? zoneDefs.find((entry, index) => {
                    if (index === zoneDefs.length - 1) {
                        return hr >= entry.min;
                    }

                    return hr >= entry.min && hr < entry.max;
                }) || zoneDefs[0]
              : zoneDefs.find((entry) => {
                    const ratio = hr / referenceMaxHr;
                    return ratio >= entry.minRatio && ratio < entry.maxRatio;
                }) || zoneDefs[zoneDefs.length - 1];
        zoneTotals.set(zone.key, zoneTotals.get(zone.key) + durationSec);
    });

    const totalTimeSec = [...zoneTotals.values()].reduce((sum, value) => sum + value, 0);
    if (!Number.isFinite(totalTimeSec) || totalTimeSec <= 0) {
        return null;
    }

    return {
        referenceMaxHr: useHrr || !zoneRanges?.length ? Math.round(referenceMaxHr) : null,
        restingHr: useHrr ? Math.round(restingHr) : null,
        totalTimeSec,
        method: useHrr ? "hrr" : zoneRanges?.length ? "strava-zones" : "fixed-max",
        zones: zoneDefs.map((zone) => {
            const seconds = zoneTotals.get(zone.key);
            const minHr = useHrr ? getHrrValue(zone.minRatio) : !zoneRanges?.length ? zone.minRatio * referenceMaxHr : zone.min;
            const maxHr = useHrr ? getHrrValue(zone.maxRatio) : !zoneRanges?.length ? zone.maxRatio * referenceMaxHr : zone.max;

            return {
                key: zone.key,
                label: zone.label,
                seconds,
                share: seconds / totalTimeSec,
                rangeLabel: useHrr || !zoneRanges?.length
                    ? (zone.maxRatio === Infinity || (useHrr && zone.maxRatio === 1.0))
                      ? `>= ${Math.round(minHr)} bpm`
                      : `${Math.round(minHr)}-${Math.round(maxHr) - 1} bpm`
                    : zone.max === Infinity
                        ? `>= ${Math.round(zone.min)} bpm`
                        : `${Math.round(zone.min)}-${Math.round(zone.max)} bpm`,
            };
        }),
    };
}

export function buildActivityZoneSummary(activityZones) {
    const heartrateZone = Array.isArray(activityZones)
        ? activityZones.find((zone) => zone?.type === "heartrate" && Array.isArray(zone.distribution_buckets))
        : null;
    if (!heartrateZone) {
        return null;
    }

    const buckets = heartrateZone.distribution_buckets
        .map((bucket, index) => ({
            key: `z${index + 1}`,
            label: `Z${index + 1}`,
            seconds: toNumber(bucket.time, 0),
            min: toNumber(bucket.min, 0),
            max: Number.isFinite(toNumber(bucket.max, NaN)) && toNumber(bucket.max, NaN) >= 0 ? toNumber(bucket.max, NaN) : Infinity,
        }))
        .filter((bucket) => bucket.seconds > 0 || bucket.max > bucket.min || bucket.max === Infinity);

    if (buckets.length === 0) {
        return null;
    }

    const totalTimeSec = buckets.reduce((sum, bucket) => sum + bucket.seconds, 0);
    if (totalTimeSec <= 0) {
        return null;
    }

    return {
        referenceMaxHr: heartrateZone.max == null ? null : Math.round(toNumber(heartrateZone.max, NaN)),
        totalTimeSec,
        method: "strava-activity-zones",
        zones: buckets.map((bucket) => ({
            key: bucket.key,
            label: bucket.label,
            seconds: bucket.seconds,
            share: bucket.seconds / totalTimeSec,
            rangeLabel:
                bucket.max === Infinity
                    ? `>= ${Math.round(bucket.min)} bpm`
                    : `${Math.round(bucket.min)}-${Math.round(bucket.max)} bpm`,
        })),
    };
}
