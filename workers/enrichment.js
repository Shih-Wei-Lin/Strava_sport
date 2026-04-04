import { APP_DB_STORES } from "../state.js";
import { calculateBestSegmentEffort } from "../analytics/segments.js";
import { readDbRecord, writeDbRecord } from "../db.js";

/**
 * Worker-specific fetcher for activity bundles (No UI/setStatus dependency)
 */
async function fetchRunDetailBundle(token, activityId) {
    const [detailResponse, streamsResponse] = await Promise.all([
        fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
            headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`https://www.strava.com/api/v3/activities/${activityId}/streams?keys=time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,temp&key_by_type=true`, {
            headers: { Authorization: `Bearer ${token}` },
        }),
    ]);

    if (!detailResponse.ok || !streamsResponse.ok) {
        throw new Error(`Failed to fetch activity bundle for ${activityId}: ${detailResponse.status}/${streamsResponse.status}`);
    }

    const [detail, streams] = await Promise.all([
        detailResponse.json(),
        streamsResponse.json(),
    ]);

    return { detail, streams };
}

/**
 * Load bundle with cache logic replicated in worker
 */
async function loadRunDetailBundleWithCacheInWorker(runId, token) {
    const cached = await readDbRecord(APP_DB_STORES.bundles, runId);
    if (cached) return cached.bundle;

    const bundle = await fetchRunDetailBundle(token, runId);
    
    await writeDbRecord(APP_DB_STORES.bundles, {
        runId,
        savedAt: new Date().toISOString(),
        bundle
    });
    return bundle;
}

/**
 * Main worker message handler
 */
self.onmessage = async (e) => {
    const { recent, token } = e.data;
    if (!recent || !token) return;

    const batchSize = 4;
    for (let i = 0; i < recent.length; i += batchSize) {
        const batch = recent.slice(i, i + batchSize);
        
        const results = await Promise.all(batch.map(async (run) => {
            try {
                const bundle = await loadRunDetailBundleWithCacheInWorker(run.id, token);
                const splits = bundle?.detail?.splits_metric;
                
                if (!Array.isArray(splits)) {
                    return { runId: run.id, bests: {} };
                }

                const bests = {};
                [1, 3, 5, 10].forEach(dist => {
                    const key = `segment${dist}k`;
                    const effort = calculateBestSegmentEffort(run, splits, dist);
                    if (effort) {
                        bests[key] = effort;
                    }
                });

                return { runId: run.id, bests };
            } catch (err) {
                console.error(`[Worker] Error processing run ${run.id}:`, err);
                return { runId: run.id, error: err.message };
            }
        }));

        // Send back progress and results for this batch
        self.postMessage({
            type: "progress",
            batch: results,
            completed: Math.min(i + batchSize, recent.length),
            total: recent.length
        });
    }

    self.postMessage({ type: "complete" });
};
