import { toNumber } from './math.js';

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

export function formatCompactDuration(seconds) {
    const totalSeconds = Math.max(0, Math.round(toNumber(seconds)));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
    }

    if (minutes > 0) {
        return `${minutes}m ${secs.toString().padStart(2, "0")}s`;
    }

    return `${secs}s`;
}

export function formatShortDate(dateInput) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(date.getTime())) {
        return "未知日期";
    }

    return date.toLocaleDateString("zh-TW", {
        month: "short",
        day: "numeric",
        weekday: "short",
    });
}

export function parseStravaLocalDate(dateInput) {
    if (!dateInput || typeof dateInput !== "string") {
        return null;
    }

    const matched = dateInput.match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/,
    );

    if (!matched) {
        const fallback = new Date(dateInput);
        return Number.isNaN(fallback.getTime()) ? null : fallback;
    }

    const [, year, month, day, hour, minute, second = "0"] = matched;
    return new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
    );
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

function cryptoRandomId() {
    return `fallback-${Math.random().toString(36).slice(2, 10)}`;
}

export function normaliseActivity(activity) {
    const startedAt =
        parseStravaLocalDate(activity.start_date_local) ||
        new Date(activity.start_date || Date.now());
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

/**
 * Format a date as a local YYYY-MM-DD string.
 */
export function toLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * Escape HTML special characters to prevent XSS.
 */
export function escapeHtml(str) {
    if (!str) return "";
    const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
    };
    return str.replace(/[&<>"']/g, (m) => map[m]);
}
