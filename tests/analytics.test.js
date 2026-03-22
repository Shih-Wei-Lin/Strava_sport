import test from "node:test";
import assert from "node:assert/strict";

import {
    buildAbilityPrediction,
    calculateBestSegmentEffort,
    formatDeltaPace,
    formatPaceFromSeconds,
    startOfWeek,
    summariseActivities,
} from "../analytics.js";

test("startOfWeek uses Monday as the first day", () => {
    const date = new Date("2026-03-22T12:00:00.000Z");
    const start = startOfWeek(date);

    assert.equal(start.getDay(), 1);
    assert.equal(start.getDate(), 16);
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
});

test("summariseActivities exposes full-run 5K and 10K efforts", () => {
    const now = new Date("2026-03-22T12:00:00.000Z");
    const activities = [
        buildRun({ id: 11, date: "2026-03-21T06:30:00.000Z", distanceKm: 5.02, movingTimeSec: 1380, hr: 168 }),
        buildRun({ id: 12, date: "2026-03-14T06:30:00.000Z", distanceKm: 5.05, movingTimeSec: 1405, hr: 166 }),
        buildRun({ id: 13, date: "2026-03-07T06:30:00.000Z", distanceKm: 10.01, movingTimeSec: 3080, hr: 161 }),
        buildRun({ id: 14, date: "2026-03-01T06:30:00.000Z", distanceKm: 10.03, movingTimeSec: 3150, hr: 159 }),
    ];

    const summary = summariseActivities(activities, now);

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

function buildRun({ id, date, distanceKm, movingTimeSec, hr }) {
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
