import test from "node:test";
import assert from "node:assert/strict";

import { formatPaceFromSeconds, startOfWeek, summariseActivities } from "../analytics.js";

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

test("summariseActivities picks approximate 5K and 10K best efforts", () => {
    const now = new Date("2026-03-22T12:00:00.000Z");
    const activities = [
        buildRun({ id: 11, date: "2026-03-21T06:30:00.000Z", distanceKm: 5.02, movingTimeSec: 1380, hr: 168 }),
        buildRun({ id: 12, date: "2026-03-14T06:30:00.000Z", distanceKm: 5.05, movingTimeSec: 1405, hr: 166 }),
        buildRun({ id: 13, date: "2026-03-07T06:30:00.000Z", distanceKm: 10.01, movingTimeSec: 3080, hr: 161 }),
        buildRun({ id: 14, date: "2026-03-01T06:30:00.000Z", distanceKm: 10.03, movingTimeSec: 3150, hr: 159 }),
    ];

    const summary = summariseActivities(activities, now);

    assert.equal(summary.bests.run5k.id, "11");
    assert.equal(summary.bests.run10k.id, "13");
    assert.equal(formatPaceFromSeconds(summary.bests.run5k.averagePaceSec), "4'35/km");
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

