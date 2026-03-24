import test from "node:test";
import assert from "node:assert/strict";

import {
    buildActivityZoneSummary,
    buildHeartRateZoneSummary,
    buildAbilityPrediction,
    calculateBestSegmentEffort,
    formatDeltaPace,
    formatCompactDuration,
    formatPaceFromSeconds,
    parseStravaLocalDate,
    startOfWeek,
    summariseActivities,
} from "../analytics.js";

test("startOfWeek uses Monday as the first day", () => {
    const date = new Date("2026-03-22T12:00:00.000Z");
    const start = startOfWeek(date);

    assert.equal(start.getDay(), 1);
    assert.equal(start.getDate(), 16);
});

test("parseStravaLocalDate keeps Strava local evening runs on the same calendar day", () => {
    const parsed = parseStravaLocalDate("2026-03-18T19:00:00Z");

    assert.equal(parsed.getFullYear(), 2026);
    assert.equal(parsed.getMonth(), 2);
    assert.equal(parsed.getDate(), 18);
    assert.equal(parsed.getHours(), 19);
});

test("summariseActivities calculates weekly and monthly totals", () => {
    const now = new Date("2026-03-22T12:00:00.000Z");
    const activities = [
        buildRun({ id: 1, date: "2026-03-21T06:30:00.000Z", distanceKm: 12, movingTimeSec: 3600, hr: 152 }),
        buildRun({ id: 2, date: "2026-03-19T06:30:00.000Z", distanceKm: 8, movingTimeSec: 2460, hr: 148 }),
        buildRun({ id: 3, date: "2026-03-10T06:30:00.000Z", distanceKm: 5, movingTimeSec: 1450, hr: 162 }),
        buildRun({ id: 4, date: "2026-02-28T06:30:00.000Z", distanceKm: 10, movingTimeSec: 3120, hr: 155 }),
    ];

    const summary = summariseActivities(activities, now);

    assert.equal(summary.totals.weekDistanceKm, 20);
    assert.equal(summary.totals.weekCount, 2);
    assert.equal(summary.totals.monthDistanceKm, 25);
    assert.equal(summary.totals.monthCount, 3);
    assert.equal(summary.totals.longestRunKm, 12);
    assert.equal(summary.weeklyTrend.length, 12);
    assert.equal(summary.weeklyTrend.at(-1).distanceKm, 20);
});

test("summariseActivities exposes full-run 1K/3K/5K/10K efforts", () => {
    const now = new Date("2026-03-22T12:00:00.000Z");
    const activities = [
        buildRun({ id: 9, date: "2026-03-22T06:30:00.000Z", distanceKm: 1.0, movingTimeSec: 225, hr: 174 }),
        buildRun({ id: 10, date: "2026-03-21T06:30:00.000Z", distanceKm: 3.01, movingTimeSec: 780, hr: 170 }),
        buildRun({ id: 11, date: "2026-03-21T06:30:00.000Z", distanceKm: 5.02, movingTimeSec: 1380, hr: 168 }),
        buildRun({ id: 12, date: "2026-03-14T06:30:00.000Z", distanceKm: 5.05, movingTimeSec: 1405, hr: 166 }),
        buildRun({ id: 13, date: "2026-03-07T06:30:00.000Z", distanceKm: 10.01, movingTimeSec: 3080, hr: 161 }),
        buildRun({ id: 14, date: "2026-03-01T06:30:00.000Z", distanceKm: 10.03, movingTimeSec: 3150, hr: 159 }),
    ];

    const summary = summariseActivities(activities, now);

    assert.equal(summary.bests.fullRun1k.id, "9");
    assert.equal(summary.bests.fullRun3k.id, "10");
    assert.equal(summary.bests.fullRun5k.id, "11");
    assert.equal(summary.bests.fullRun10k.id, "13");
    assert.equal(formatPaceFromSeconds(summary.bests.fullRun5k.averagePaceSec), "4'35/km");
});

test("summariseActivities uses comparable distances for pace delta", () => {
    const now = new Date("2026-03-22T12:00:00.000Z");
    const activities = [
        buildRun({ id: 1, date: "2026-03-21T06:30:00.000Z", distanceKm: 5, movingTimeSec: 1350, hr: 160 }),
        buildRun({ id: 2, date: "2026-03-20T06:30:00.000Z", distanceKm: 5.1, movingTimeSec: 1390, hr: 162 }),
        buildRun({ id: 3, date: "2026-03-19T06:30:00.000Z", distanceKm: 15, movingTimeSec: 4950, hr: 145 }),
        buildRun({ id: 4, date: "2026-03-18T06:30:00.000Z", distanceKm: 16, movingTimeSec: 5440, hr: 144 }),
        buildRun({ id: 5, date: "2026-03-14T06:30:00.000Z", distanceKm: 5, movingTimeSec: 1410, hr: 159 }),
        buildRun({ id: 6, date: "2026-03-13T06:30:00.000Z", distanceKm: 5.1, movingTimeSec: 1450, hr: 160 }),
        buildRun({ id: 7, date: "2026-03-12T06:30:00.000Z", distanceKm: 15, movingTimeSec: 5100, hr: 146 }),
        buildRun({ id: 8, date: "2026-03-11T06:30:00.000Z", distanceKm: 16, movingTimeSec: 5530, hr: 145 }),
    ];

    const summary = summariseActivities(activities, now);

    assert.equal(summary.insight.paceDeltaSec, -12);
    assert.equal(formatDeltaPace(summary.insight.paceDeltaSec), "快 0:12/km");
});

test("summariseActivities exposes advanced distribution metrics", () => {
    const now = new Date("2026-03-22T12:00:00.000Z");
    const activities = [
        buildRun({ id: 101, date: "2026-03-21T06:30:00.000Z", distanceKm: 14, movingTimeSec: 4500, hr: 150, cadence: 172 }),
        buildRun({ id: 102, date: "2026-03-20T06:30:00.000Z", distanceKm: 8, movingTimeSec: 2580, hr: 154, cadence: 176 }),
        buildRun({ id: 103, date: "2026-03-18T06:30:00.000Z", distanceKm: 10, movingTimeSec: 3300, hr: 152, cadence: 174 }),
        buildRun({ id: 104, date: "2026-03-16T06:30:00.000Z", distanceKm: 6, movingTimeSec: 1980, hr: 156, cadence: 178 }),
        buildRun({ id: 105, date: "2026-03-13T06:30:00.000Z", distanceKm: 12, movingTimeSec: 3960, hr: 148, cadence: 170 }),
        buildRun({ id: 106, date: "2026-03-10T06:30:00.000Z", distanceKm: 7, movingTimeSec: 2310, hr: 151, cadence: 175 }),
    ];

    const summary = summariseActivities(activities, now);

    assert.ok(summary.totals.averageRunDistanceKm > 9);
    assert.ok(summary.totals.averageRunDurationSec > 2500);
    assert.ok(summary.totals.qualityRunRatio >= 0);
    assert.ok(summary.totals.longRunSharePercent > 20);
    assert.ok(summary.totals.recentCadence > 170);
});

test("calculateBestSegmentEffort finds the fastest rolling 5K from splits", () => {
    const run = {
        id: "run-1",
        name: "Long Run",
        dateLabel: "3月 21日",
        startedAt: new Date("2026-03-21T06:30:00.000Z"),
    };

    const splits = [
        buildSplit({ split: 1, paceSec: 330 }),
        buildSplit({ split: 2, paceSec: 320 }),
        buildSplit({ split: 3, paceSec: 305 }),
        buildSplit({ split: 4, paceSec: 300 }),
        buildSplit({ split: 5, paceSec: 295 }),
        buildSplit({ split: 6, paceSec: 298 }),
        buildSplit({ split: 7, paceSec: 315 }),
    ];

    const effort = calculateBestSegmentEffort(run, splits, 5);

    assert.equal(Math.round(effort.movingTimeSec), 1513);
    assert.equal(effort.splitRangeLabel, "2.0K-7.0K");
    assert.equal(effort.averagePaceLabel, "5'03/km");
});

test("buildAbilityPrediction returns VDOT-based equivalent performances", () => {
    const profile = buildAbilityPrediction([
        {
            id: "5k-segment",
            name: "Best 5K",
            dateLabel: "3月 21日",
            distanceKm: 5,
            movingTimeSec: 1500,
            averagePaceSec: 300,
            source: "segment",
            splitRangeLabel: "4.0K-9.0K",
        },
    ]);

    assert.equal(profile.model, "VDOT");
    assert.ok(profile.vdot > 38 && profile.vdot < 39);
    assert.ok(profile.predictions["10K"].vdotTimeSec > 3000);
    assert.ok(profile.predictions["10K"].vdotTimeSec < 3200);
});

test("buildHeartRateZoneSummary groups stream time into five relative zones", () => {
    const summary = buildHeartRateZoneSummary(
        {
            heartrate: { data: [110, 125, 145, 165, 178] },
            time: { data: [0, 300, 600, 900, 1200] },
        },
        { moving_time: 1200, max_heartrate: 180 },
        { referenceMaxHr: 190 },
    );

    assert.equal(summary.method, "fixed-max");
    assert.equal(summary.referenceMaxHr, 190);
    assert.equal(Math.round(summary.totalTimeSec), 1200);
    assert.deepEqual(
        summary.zones.map((zone) => Math.round(zone.seconds)),
        [300, 300, 300, 300, 0],
    );
    assert.equal(summary.zones[4].rangeLabel, ">= 171 bpm");
});

test("buildHeartRateZoneSummary prefers Strava zone ranges when provided", () => {
    const summary = buildHeartRateZoneSummary(
        {
            heartrate: { data: [118, 132, 146, 162, 176] },
            time: { data: [0, 240, 480, 720, 960] },
        },
        { moving_time: 960 },
        {
            zoneRanges: [
                { min: 100, max: 129 },
                { min: 130, max: 144 },
                { min: 145, max: 159 },
                { min: 160, max: 174 },
                { min: 175, max: 220 },
            ],
        },
    );

    assert.equal(summary.method, "strava-zones");
    assert.equal(summary.referenceMaxHr, null);
    assert.deepEqual(
        summary.zones.map((zone) => Math.round(zone.seconds)),
        [240, 240, 240, 240, 0],
    );
    assert.equal(summary.zones[0].rangeLabel, "100-129 bpm");
    assert.equal(summary.zones[4].rangeLabel, "175-220 bpm");
});

test("buildActivityZoneSummary maps Strava activity heartrate buckets", () => {
    const summary = buildActivityZoneSummary([
        {
            type: "heartrate",
            max: 182,
            distribution_buckets: [
                { min: 95, max: 119, time: 120 },
                { min: 120, max: 139, time: 240 },
                { min: 140, max: 154, time: 360 },
                { min: 155, max: 169, time: 180 },
                { min: 170, max: -1, time: 60 },
            ],
        },
    ]);

    assert.equal(summary.method, "strava-activity-zones");
    assert.equal(summary.referenceMaxHr, 182);
    assert.deepEqual(
        summary.zones.map((zone) => Math.round(zone.seconds)),
        [120, 240, 360, 180, 60],
    );
    assert.equal(summary.zones[4].rangeLabel, ">= 170 bpm");
});

test("formatCompactDuration renders dense time labels for zone summaries", () => {
    assert.equal(formatCompactDuration(95), "1m 35s");
    assert.equal(formatCompactDuration(3720), "1h 02m");
});

function buildRun({ id, date, distanceKm, movingTimeSec, hr, cadence = 174 }) {
    return {
        id,
        type: "Run",
        name: `Run ${id}`,
        start_date_local: date,
        distance: distanceKm * 1000,
        moving_time: movingTimeSec,
        average_heartrate: hr,
        average_speed: (distanceKm * 1000) / movingTimeSec,
        total_elevation_gain: 100,
        average_cadence: cadence,
    };
}

function buildSplit({ split, paceSec }) {
    return {
        split,
        distance: 1000,
        moving_time: paceSec,
        average_speed: 1000 / paceSec,
        average_heartrate: 160,
        elevation_difference: 0,
    };
}
