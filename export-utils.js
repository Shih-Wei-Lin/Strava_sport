import { formatPaceFromSpeed } from "./analytics.js";

export function buildRunExportPayload(run, bundle) {
    const { detail, streams } = bundle || {};
    
    // Curate specifically useful data from the messy Strava detail object
    const cleanedDetail = detail ? {
        id: detail.id,
        name: detail.name,
        distance: detail.distance,
        moving_time: detail.moving_time,
        elapsed_time: detail.elapsed_time,
        total_elevation_gain: detail.total_elevation_gain,
        type: detail.type,
        start_date: detail.start_date,
        start_date_local: detail.start_date_local,
        timezone: detail.timezone,
        description: detail.description,
        calories: detail.calories,
        device_name: detail.device_name,
        average_speed: detail.average_speed,
        max_speed: detail.max_speed,
        average_cadence: detail.average_cadence,
        average_heartrate: detail.average_heartrate,
        max_heartrate: detail.max_heartrate,
        splits_metric: detail.splits_metric?.map(s => ({
            split: s.split,
            distance: s.distance,
            elapsed_time: s.elapsed_time,
            moving_time: s.moving_time,
            elevation_difference: s.elevation_difference,
            average_speed: s.average_speed,
            average_heartrate: s.average_heartrate,
            pace: formatPaceFromSpeed(s.average_speed)
        })) || []
    } : null;

    return {
        export_metadata: {
            app: "Stride Scope",
            version: "1.2.0",
            exported_at: new Date().toISOString()
        },
        activity: {
            id: run.id,
            name: run.name,
            date: run.dateLabel,
            distance_km: Number(run.distanceKm.toFixed(2)),
            moving_time: run.movingTimeLabel,
            moving_time_seconds: run.movingTimeSec,
            average_pace: run.averagePaceLabel,
            average_heartrate: run.averageHeartrate,
            total_elevation_gain: Math.round(run.elevationGain),
            cadence: run.cadence
        },
        analysis: cleanedDetail,
        streams: streams || {},
        raw_detail_link: `https://www.strava.com/activities/${run.id}`
    };
}

export function buildAggregateRecord(run, bundle) {
    return {
        activity_id: run.id,
        date: run.dateLabel,
        started_at_local: run.startedAt?.toISOString?.() || null,
        name: run.name,
        summary: {
            distance_km: Number(run.distanceKm.toFixed(2)),
            moving_time_seconds: run.movingTimeSec,
            average_pace: run.averagePaceLabel,
            average_heartrate: run.averageHeartrate,
            total_elevation_gain_m: Math.round(run.elevationGain),
        },
        detail: bundle?.detail || null,
        streams: bundle?.streams || {},
    };
}

export function buildAggregateMarkdown(aggregate) {
    const lines = [
        "# Strava Runs Aggregate Export",
        "",
        `- Exported at: ${aggregate.exported_at}`,
        `- Run count: ${aggregate.run_count}`,
        "",
    ];

    aggregate.runs.forEach((run, index) => {
        lines.push(`## ${index + 1}. ${run.name}`);
        lines.push(`- Date: ${run.date}`);
        lines.push(`- Distance: ${run.summary.distance_km} km`);
        lines.push(`- Moving time: ${run.summary.moving_time_seconds} sec`);
        lines.push(`- Average pace: ${run.summary.average_pace}`);
        lines.push(
            `- Average heartrate: ${run.summary.average_heartrate == null ? "--" : `${run.summary.average_heartrate} bpm`}`,
        );
        lines.push(`- Elevation gain: ${run.summary.total_elevation_gain_m} m`);

        const splits = Array.isArray(run.detail?.splits_metric) ? run.detail.splits_metric.slice(0, 8) : [];
        if (splits.length > 0) {
            lines.push("");
            lines.push("| Km | Pace | HR | Elevation |");
            lines.push("| --- | --- | --- | --- |");
            splits.forEach((split) => {
                const pace = split.average_speed ? formatPaceFromSpeed(split.average_speed) : "--";
                const hr = split.average_heartrate == null ? "--" : Math.round(split.average_heartrate);
                const elevation = Math.round(split.elevation_difference || 0);
                lines.push(`| ${split.split} | ${pace} | ${hr} | ${elevation} m |`);
            });
        }

        lines.push("");
    });

    return lines.join("\n");
}

export function downloadText(content, filename, mimeType = "text/plain") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

export function formatDateForFilename(dateInput) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(date.getTime())) {
        return "unknown-date";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function slugifyFilename(value) {
    const sanitized = String(value)
        .trim()
        .replace(/[^\p{Letter}\p{Number}_-]+/gu, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

    return sanitized || "run";
}

export function downloadJson(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

/**
 * High-level function to download a single run's JSON.
 */
export async function downloadRunJson(runId, summary, detailCache) {
    const run = summary?.runs.find(r => r.id === runId);
    if (!run) return;

    const bundle = detailCache.get(runId);
    const payload = buildRunExportPayload(run, bundle);
    const filename = `${formatDateForFilename(run.startedAt || new Date())}_${slugifyFilename(run.name)}.json`;
    downloadJson(payload, filename);
}

/**
 * High-level function to download all runs.
 */
export async function downloadAllRuns(format, summary, detailCache) {
    if (!summary?.runs?.length) return;

    const records = [];
    for (const run of summary.runs) {
        const bundle = detailCache.get(run.id);
        records.push(buildAggregateRecord(run, bundle));
    }

    const aggregate = {
        exported_at: new Date().toISOString(),
        run_count: records.length,
        runs: records,
    };

    const timestamp = formatDateForFilename(new Date());

    if (format === "json") {
        downloadJson(aggregate, `${timestamp}_strava_runs_aggregate.json`);
    } else {
        const markdown = buildAggregateMarkdown(aggregate);
        downloadText(markdown, `${timestamp}_strava_runs_aggregate.md`, "text/markdown");
    }
}

/**
 * Build a Markdown report for a single run.
 */
export function buildRunMarkdown(run, bundle) {
    const { detail } = bundle || {};
    const lines = [
        `# ${run.name}`,
        "",
        `**日期**: ${run.dateLabel}`,
        `**Strava 連結**: [查看活動](https://www.strava.com/activities/${run.id})`,
        "",
        "## 核心數據",
        "",
        "| 項目 | 數值 |",
        "| :--- | :--- |",
        `| 距離 | ${run.distanceKm.toFixed(2)} km |`,
        `| 移動時間 | ${run.movingTimeLabel} |`,
        `| 平均配速 | ${run.averagePaceLabel} |`,
        `| 平均心率 | ${run.averageHeartrate || "--"} bpm |`,
        `| 總爬升 | ${Math.round(run.elevationGain)} m |`,
        `| 卡路里 | ${detail?.calories || "--"} kcal |`,
        `| 平均步頻 | ${run.cadence || "--"} spm |`,
        `| 設備 | ${detail?.device_name || "未知"} |`,
        "",
    ];

    const splits = detail?.splits_metric || [];
    if (splits.length > 0) {
        lines.push("## 每公里拆分 (Splits)");
        lines.push("");
        lines.push("| 公里 | 配速 | 心率 | 爬升 |");
        lines.push("| :--- | :--- | :--- | :--- |");
        splits.forEach((s) => {
            const pace = formatPaceFromSpeed(s.average_speed);
            const hr = s.average_heartrate ? Math.round(s.average_heartrate) : "--";
            const elev = Math.round(s.elevation_difference || 0);
            lines.push(`| ${s.split} | ${pace} | ${hr} | ${elev} m |`);
        });
        lines.push("");
    }

    if (detail?.description) {
        lines.push("## 備註");
        lines.push(detail.description);
        lines.push("");
    }

    lines.push("---");
    lines.push("*Exported by Stride Scope*");

    return lines.join("\n");
}

/**
 * High-level function to download a single run's Markdown.
 */
export async function downloadRunMd(runId, summary, detailCache) {
    const run = summary?.runs.find((r) => r.id === runId);
    if (!run) return;

    const bundle = detailCache.get(runId);
    const markdown = buildRunMarkdown(run, bundle);
    const filename = `${formatDateForFilename(run.startedAt || new Date())}_${slugifyFilename(run.name)}.md`;
    downloadText(markdown, filename, "text/markdown");
}
