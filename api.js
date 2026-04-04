import { loadCachedRuns, saveCachedRuns } from "./db.js";
import { clearTokenStorage } from "./auth.js";
import { setStatus } from "./ui-utils.js";

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
        while (page <= 20) { // Safety cap at 2000 activities
            const response = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=${page}`, {
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

        const filteredRuns = activities.filter((activity) => activity.type === "Run" || activity.sport_type === "Run");
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
        const response = await fetch("https://www.strava.com/api/v3/athlete/zones", {
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
        fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
            headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`https://www.strava.com/api/v3/activities/${activityId}/streams?keys=time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,temp&key_by_type=true`, {
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
