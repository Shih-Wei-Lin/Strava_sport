const FIVE_K_MIN = 4.8;
const FIVE_K_MAX = 5.3;
const TEN_K_MIN = 9.5;
const TEN_K_MAX = 10.5;

const PREDICTION_DISTANCES = {
    "5K": 5000,
    "10K": 10000,
    "Half": 21097.5,
    "Marathon": 42195,
};

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

    const totalSeconds = Math.round(safe);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
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

export function formatDeltaPace(seconds) {
    const value = toNumber(seconds, NaN);
    if (!Number.isFinite(value)) {
        return "--";
    }

    const abs = Math.abs(Math.round(value));
    const minutes = Math.floor(abs / 60);
    const secs = abs % 60;
    const direction = value < 0 ? "快" : "慢";
    return `${direction} ${minutes}:${secs.toString().padStart(2, "0")}/km`;
}

export function normaliseActivity(activity) {
    const startedAt = new Date(activity.start_date_local || activity.start_date || Date.now());
    const distanceKm = toNumber(activity.distance) / 1000;
    const movingTimeSec = toNumber(activity.moving_time);
    const averageSpeed = toNumber(activity.average_speed, NaN);
    const averageHeartrate =
        activity.average_heartrate == null ? null : Math.round(toNumber(activity.average_heartrate, NaN));
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
        source: "activity",
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

function median(values) {
    const filtered = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
    if (filtered.length === 0) {
        return null;
    }

    const middle = Math.floor(filtered.length / 2);
    if (filtered.length % 2 === 1) {
        return filtered[middle];
    }

    return (filtered[middle - 1] + filtered[middle]) / 2;
}

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

    return `${Math.round((activeDays.size / 28) * 100)}%`;
}

function selectComparableRuns(runs) {
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

function buildPaceTrend(runs) {
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

function buildTrendInsight(runs) {
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

function getSplitTimeSec(split) {
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
                averageHeartrate: split.average_heartrate == null ? null : toNumber(split.average_heartrate, NaN),
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

export function summariseActivities(activities, now = new Date()) {
    const runs = activities
        .filter((activity) => activity.type === "Run" || activity.sport_type === "Run")
        .map((activity) => normaliseActivity(activity))
        .sort((left, right) => right.startedAt - left.startedAt);

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
    const prediction = buildAbilityPrediction([
        fullRun5k,
        fullRun10k,
        ...recentFullEfforts.filter((run) => run.distanceKm >= 3 && run.distanceKm <= 21.1).slice(0, 16),
    ]);

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
            fullRun5k,
            fullRun10k,
            segment5k: null,
            segment10k: null,
        },
        weeklyTrend: buildWeeklyTrend(runs, now),
        insight: buildTrendInsight(runs),
        prediction,
    };
}
