export const STORAGE_KEYS = {
    clientId: "strava_client_id",
    clientSecret: "strava_client_secret",
    accessToken: "strava_access_token",
    refreshToken: "strava_refresh_token",
    expiresAt: "strava_expires_at",
    athleteName: "strava_athlete_name",
    authState: "strava_oauth_state",
    calendarHeatmapMode: "calendar_heatmap_mode",
    restingHr: "strava_resting_hr",
    maxHr: "strava_max_hr",
};

export const FIXED_MAX_HEARTRATE = 190;
export const RUNS_PER_PAGE = 10;
export const APP_DB_NAME = "stride_scope_db";
export const APP_DB_VERSION = 1;
export const APP_DB_STORES = {
    runs: "run_activities",
    bundles: "run_bundles",
};

/**
 * Safely retrieve a value from localStorage with a fallback.
 */
function getSafeStorage(key, fallback) {
    try {
        return localStorage.getItem(key) || fallback;
    } catch (e) {
        console.warn(`Storage access blocked for ${key}:`, e);
        return fallback;
    }
}

export const state = {
    summary: null,
    athleteZones: null,
    detailCache: new Map(),
    runCharts: new Map(),
    weeklyChart: null,
    enrichmentRunId: 0,
    enrichmentWorker: null,
    runsPage: 1,
    calMonth: new Date().getMonth(),
    calYear: new Date().getFullYear(),
    calendarHeatmapMode: getSafeStorage(STORAGE_KEYS.calendarHeatmapMode, "distance"),
    dashboardTab: "overview",
    installPromptEvent: null,
    pullRefresh: {
        active: false,
        armed: false,
        loading: false,
        startY: 0,
        distance: 0,
    },
};
