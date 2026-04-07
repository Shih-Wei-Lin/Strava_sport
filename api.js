import { loadCachedRuns, saveCachedRuns } from "./db.js";
import { clearTokenStorage } from "./auth.js";
import { setStatus } from "./ui-utils.js";

const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);

/**
 * Check if a Strava activity is a run-related activity.
 * @param {object} activity - Strava activity object.
 * @returns {boolean}
 */
function isRunActivity(activity) {
    return RUN_TYPES.has(activity.type) || RUN_TYPES.has(activity.sport_type);
}

/**
 * Perform a fetch with automatic retry on 429 (Too Many Requests).
 * @param {string} url - Target URL.
 * @param {object} options - Fetch options.
 * @param {number} retries - Max retries.
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, retries = 3) {
    let attempt = 0;
    while (attempt <= retries) {
        const response = await fetch(url, options);

        if (response.status === 429 && attempt < retries) {
            const retryAfter = response.headers.get("Retry-After");
            const waitMs = (retryAfter ? parseInt(retryAfter, 10) : Math.pow(2, attempt) * 1000);
            setStatus(`Strava API 頻率限制中，將在 ${Math.ceil(waitMs/1000)} 秒後重試...`, "info");
            await new Promise(resolve => setTimeout(resolve, waitMs));
            attempt++;
            continue;
        }

        return response;
    }
}

/**
 * Fetch run activities from Strava with IndexedDB fallback cache.
 * @param {string} token - Valid Strava access token.
 * @returns {Promise<Array<object>>}
 */
export async function fetchRunActivities(token) {
    const cachedRuns = await loadCachedRuns();
    const activities = [];
    const perPage = 100;

    try {
        let page = 1;
        while (page <= 50) { // Increased safety cap to 5000 activities
            const response = await fetchWithRetry(`https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=${page}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            
            if (response.status === 401) {
                clearTokenStorage();
                throw new Error("Strava access token 已失效，請重新授權。");
            }

            if (!response.ok) {
                throw new Error(`Strava activities API 錯誤 (${response.status})。`);
            }

            const pageData = await response.json();
            if (!Array.isArray(pageData) || pageData.length === 0) {
                break;
            }

            activities.push(...pageData);
            if (pageData.length < perPage) {
                break;
            }
            page += 1;
        }

        const filteredRuns = activities.filter(isRunActivity);
        await saveCachedRuns(filteredRuns);
        return filteredRuns;
    } catch (error) {
        if (cachedRuns.length > 0) {
            setStatus(`Strava API 暫時不可用，改用本機快取資料（${cachedRuns.length} 筆）。`, "info");
            return cachedRuns;
        }

        throw error;
    }
}

/**
 * Fetch the athlete's heart rate zones from Strava.
 * @param {string} token - Valid Strava access token.
 * @returns {Promise<object|null>}
 */
export async function fetchAthleteZones(token) {
    try {
        const response = await fetchWithRetry("https://www.strava.com/api/v3/athlete/zones", {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 401 || response.status === 403) {
            return null;
        }

        if (!response.ok) {
            return null;
        }

        const zones = await response.json();
        return zones?.heart_rate?.zones ? zones : null;
    } catch (error) {
        console.warn("Failed to fetch athlete zones", error);
        return null;
    }
}

/**
 * Fetch a detailed activity bundle (details + streams).
 * @param {string} token - Valid Strava access token.
 * @param {number} activityId - Strava activity id.
 * @returns {Promise<object>}
 */
export async function fetchRunDetailBundle(token, activityId) {
    const [detailResponse, streamsResponse] = await Promise.all([
        fetchWithRetry(`https://www.strava.com/api/v3/activities/${activityId}`, {
            headers: { Authorization: `Bearer ${token}` },
        }),
        fetchWithRetry(`https://www.strava.com/api/v3/activities/${activityId}/streams?keys=time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,temp&key_by_type=true`, {
            headers: { Authorization: `Bearer ${token}` },
        }),
    ]);

    if (!detailResponse.ok || !streamsResponse.ok) {
        throw new Error(`Failed to fetch activity bundle for ${activityId}`);
    }

    const [detail, streams] = await Promise.all([
        detailResponse.json(),
        streamsResponse.json(),
    ]);

    return { detail, streams };
}
