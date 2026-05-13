import test from "node:test";
import assert from "node:assert/strict";

// Mock browser globals for Node test environment
globalThis.document = {
    getElementById: () => ({ textContent: "", className: "", classList: { add: () => {}, remove: () => {} } }),
    createElement: () => ({ appendChild: () => {}, click: () => {} }),
    body: { appendChild: () => {}, removeChild: () => {} }
};
globalThis.URL = {
    createObjectURL: () => "mock-url",
    revokeObjectURL: () => {}
};
globalThis.Blob = class { constructor() {} };

Object.defineProperty(globalThis, 'navigator', {
    value: { vibrate: () => {} },
    configurable: true
});

import { buildRunExportPayload, buildAggregateRecord } from "../export-utils.js";

test("buildRunExportPayload includes movement data (cleanedDetail) when bundle is present", () => {
    const run = { 
        id: 123, 
        name: "Morning Run", 
        distanceKm: 10.5, 
        movingTimeSec: 3000, 
        dateLabel: "2026-03-21",
        movingTimeLabel: "50:00",
        averagePaceLabel: "4:45/km",
        averageHeartrate: 150,
        elevationGain: 100,
        cadence: 174
    };
    
    const bundle = {
        detail: { 
            id: 123,
            calories: 600, 
            device_name: "Garmin",
            splits_metric: [
                { split: 1, distance: 1000, average_speed: 3.5, average_heartrate: 145 }
            ]
        },
        streams: { 
            distance: { data: [0, 1000] },
            heartrate: { data: [140, 150] }
        }
    };
    
    const payload = buildRunExportPayload(run, bundle);
    
    assert.equal(payload.activity.id, 123);
    assert.equal(payload.activity.distance_km, 10.5);
    assert.equal(payload.analysis.calories, 600);
    assert.equal(payload.analysis.device_name, "Garmin");
    assert.equal(payload.analysis.splits_metric.length, 1);
    assert.ok(payload.streams.distance);
    assert.ok(payload.streams.heartrate);
});

test("buildRunExportPayload handles missing bundle by providing null analysis and empty streams", () => {
    const run = { 
        id: 123, 
        name: "Morning Run", 
        distanceKm: 10.5, 
        movingTimeSec: 3000, 
        dateLabel: "2026-03-21",
        movingTimeLabel: "50:00",
        averagePaceLabel: "4:45/km",
        averageHeartrate: 150,
        elevationGain: 100,
        cadence: 174
    };
    
    const payload = buildRunExportPayload(run, null);
    
    assert.equal(payload.activity.id, 123);
    assert.equal(payload.analysis, null);
    assert.deepEqual(payload.streams, {});
});

test("buildAggregateRecord includes detail and streams from bundle", () => {
    const run = { 
        id: 456, 
        name: "Evening Run", 
        distanceKm: 5, 
        movingTimeSec: 1500, 
        dateLabel: "2026-03-22" 
    };
    const bundle = {
        detail: { calories: 300 },
        streams: { time: { data: [0, 1] } }
    };
    
    const record = buildAggregateRecord(run, bundle);
    
    assert.equal(record.activity_id, 456);
    assert.equal(record.detail.calories, 300);
    assert.ok(record.streams.time);
});

test("buildAggregateRecord handles missing bundle in aggregate", () => {
    const run = { 
        id: 456, 
        name: "Evening Run", 
        distanceKm: 5, 
        movingTimeSec: 1500, 
        dateLabel: "2026-03-22" 
    };
    
    const record = buildAggregateRecord(run, null);
    
    assert.equal(record.detail, null);
    assert.deepEqual(record.streams, {});
});
