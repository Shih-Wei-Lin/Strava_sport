import { 
    formatDistance, 
    formatPaceFromSeconds, 
    formatDuration, 
    formatDeltaPace 
} from "../analytics.js";

/**
 * Render basic top-level statistics (weekly/monthly mileage, etc.).
 * @param {object} summary - Activity summary data.
 */
export function renderTopStats(summary) {
    const el = {
        monthMileage: document.getElementById("month-mileage"),
        monthCount: document.getElementById("month-count"),
        weekMileage: document.getElementById("week-mileage"),
        weekCount: document.getElementById("week-count"),
        recentPace: document.getElementById("recent-pace"),
        recentPaceNote: document.getElementById("recent-pace-note"),
        recentHr: document.getElementById("recent-hr"),
        recentHrNote: document.getElementById("recent-hr-note"),
        acwrScore: document.getElementById("acwr-score"),
        acwrNote: document.getElementById("acwr-note"),
        efficiencyScore: document.getElementById("efficiency-score"),
        efficiencyNote: document.getElementById("efficiency-note"),
        recentCadence: document.getElementById("recent-cadence"),
        recentCadenceNote: document.getElementById("recent-cadence-note"),
        elevationDensity: document.getElementById("elevation-density"),
        elevationDensityNote: document.getElementById("elevation-density-note"),
        pb1k: document.getElementById("pb-1k"),
        pb1kDate: document.getElementById("pb-1k-date"),
        pb3k: document.getElementById("pb-3k"),
        pb3kDate: document.getElementById("pb-3k-date"),
        pb5k: document.getElementById("pb-5k"),
        pb5kDate: document.getElementById("pb-5k-date"),
        pb10k: document.getElementById("pb-10k"),
        pb10kDate: document.getElementById("pb-10k-date"),
    };

    if (!el.monthMileage) return;
    
    el.monthMileage.textContent = formatDistance(summary.totals.monthDistanceKm);
    el.monthCount.textContent = `${summary.totals.monthCount} 次跑步`;
    el.weekMileage.textContent = formatDistance(summary.totals.weekDistanceKm);
    el.weekCount.textContent = `${summary.totals.weekCount} 次跑步`;

    el.recentPace.textContent = formatPaceFromSeconds(summary.totals.recentAveragePaceSec);
    el.recentPaceNote.textContent = "最近 4 次活動";
    
    el.recentHr.textContent = summary.totals.recentAverageHr == null 
        ? "--" : `${Math.round(summary.totals.recentAverageHr)} bpm`;
    el.recentHrNote.textContent = "最近 4 次活動";

    if (el.acwrScore && el.acwrNote) {
        el.acwrScore.textContent = formatAcwr(summary.totals.acuteChronicRatio);
        el.acwrNote.textContent = explainAcwr(summary.totals.acuteChronicRatio);
    }

    if (el.efficiencyScore && el.efficiencyNote) {
        el.efficiencyScore.textContent = formatEfficiencyIndex(summary.totals.efficiencyIndex);
        el.efficiencyNote.textContent = "最近 6 次速度 / 心率";
    }

    if (el.recentCadence && el.recentCadenceNote) {
        el.recentCadence.textContent = summary.totals.recentCadence == null 
            ? "--" : `${summary.totals.recentCadence.toFixed(1)} spm`;
        el.recentCadenceNote.textContent = "最近 6 次活動";
    }

    if (el.elevationDensity && el.elevationDensityNote) {
        el.elevationDensity.textContent = summary.totals.elevationPerKm == null 
            ? "--" : `${summary.totals.elevationPerKm.toFixed(1)} m/km`;
        el.elevationDensityNote.textContent = "最近每公里平均爬升";
    }

    renderBestEffort(el.pb1k, el.pb1kDate, getDisplayBestEffort(summary, "1K"), "尚未找到 1K 紀錄");
    renderBestEffort(el.pb3k, el.pb3kDate, getDisplayBestEffort(summary, "3K"), "尚未找到 3K 紀錄");
    renderBestEffort(el.pb5k, el.pb5kDate, getDisplayBestEffort(summary, "5K"), "尚未找到 5K 紀錄");
    renderBestEffort(el.pb10k, el.pb10kDate, getDisplayBestEffort(summary, "10K"), "尚未找到 10K 紀錄");
}

/**
 * Render training insights and metrics.
 * @param {object} summary - Activity summary data.
 */
export function renderInsight(summary) {
    const el = {
        trainingHeadline: document.getElementById("training-headline"),
        trainingSummary: document.getElementById("training-summary"),
        recentLoad: document.getElementById("recent-load"),
        longestRun: document.getElementById("longest-run"),
        paceDelta: document.getElementById("pace-delta"),
        consistencyScore: document.getElementById("consistency-score"),
        avgRunDistance: document.getElementById("avg-run-distance"),
        avgRunDuration: document.getElementById("avg-run-duration"),
        qualityRunRatio: document.getElementById("quality-run-ratio"),
        hrDeltaTrend: document.getElementById("hr-delta-trend"),
        longRunShare: document.getElementById("long-run-share"),
    };

    if (!el.trainingHeadline) return;

    el.trainingHeadline.textContent = summary.insight.headline;
    el.trainingSummary.textContent = summary.insight.summary;
    el.recentLoad.textContent = formatDistance(summary.totals.recentSevenDayDistanceKm);
    el.longestRun.textContent = formatDistance(summary.totals.longestRunKm);
    el.paceDelta.textContent = formatDeltaPace(summary.insight.paceDeltaSec);
    el.consistencyScore.textContent = summary.totals.consistencyScore;
    
    if (el.avgRunDistance) el.avgRunDistance.textContent = formatDistance(summary.totals.averageRunDistanceKm);
    if (el.avgRunDuration) el.avgRunDuration.textContent = summary.totals.averageRunDurationSec == null ? "--" : formatDuration(summary.totals.averageRunDurationSec);
    if (el.qualityRunRatio) el.qualityRunRatio.textContent = formatPercentage(summary.totals.qualityRunRatio);
    if (el.hrDeltaTrend) el.hrDeltaTrend.textContent = formatHrDelta(summary.totals.hrDeltaBpm);
    if (el.longRunShare) el.longRunShare.textContent = formatPercentage(summary.totals.longRunSharePercent);
}

/**
 * Render race performance predictions.
 * @param {object} summary - Activity summary data.
 */
export function renderPrediction(summary) {
    const el = {
        abilityModel: document.getElementById("ability-model"),
        abilityScore: document.getElementById("ability-score"),
        predictionSource: document.getElementById("prediction-source"),
        pred5k: document.getElementById("pred-5k"),
        pred10k: document.getElementById("pred-10k"),
        predHalf: document.getElementById("pred-half"),
        predMarathon: document.getElementById("pred-marathon"),
        predictionNote: document.getElementById("prediction-note"),
    };

    const prediction = summary.prediction;
    if (!prediction) {
        if (el.abilityModel) el.abilityModel.textContent = "VDOT";
        if (el.abilityScore) el.abilityScore.textContent = "--";
        if (el.predictionSource) el.predictionSource.textContent = "需要 3K 以上有效資料";
        if (el.pred5k) el.pred5k.textContent = "--";
        if (el.pred10k) el.pred10k.textContent = "--";
        if (el.predHalf) el.predHalf.textContent = "--";
        if (el.predMarathon) el.predMarathon.textContent = "--";
        if (el.predictionNote) el.predictionNote.textContent = "目前資料不足，無法預測。";
        return;
    }

    if (el.abilityModel) el.abilityModel.textContent = prediction.model;
    if (el.abilityScore) el.abilityScore.textContent = prediction.vdot.toFixed(1);

    const anchor = prediction.anchor;
    const sourceKind = anchor.source === "segment" ? `區段 ${anchor.splitRangeLabel}` : "整筆";
    if (el.predictionSource) el.predictionSource.textContent = `${anchor.dateLabel} · ${sourceKind}`;
    if (el.pred5k) el.pred5k.textContent = prediction.predictions["5K"].vdotTimeLabel;
    if (el.pred10k) el.pred10k.textContent = prediction.predictions["10K"].vdotTimeLabel;
    if (el.predHalf) el.predHalf.textContent = prediction.predictions.Half.vdotTimeLabel;
    if (el.predMarathon) el.predMarathon.textContent = prediction.predictions.Marathon.vdotTimeLabel;
    if (el.predictionNote) el.predictionNote.textContent = `${prediction.caution} Riegel 外推：${prediction.predictions.Marathon.riegelTimeLabel}`;
}

// Internal Helpers

function formatAcwr(ratio) {
    return Number.isFinite(ratio) ? ratio.toFixed(2) : "--";
}

function explainAcwr(ratio) {
    if (!Number.isFinite(ratio)) return "資料不足";
    if (ratio < 0.8) return "跑量較低";
    if (ratio <= 1.3) return "合理負荷";
    return "負荷過高";
}

function formatEfficiencyIndex(value) {
    return Number.isFinite(value) ? value.toFixed(2) : "--";
}

function renderBestEffort(valueNode, subtextNode, effort, emptyText) {
    if (!valueNode || !subtextNode) return;
    if (!effort) {
        valueNode.textContent = "--";
        subtextNode.textContent = emptyText;
        return;
    }
    valueNode.textContent = formatDuration(effort.movingTimeSec);
    const rangeText = effort.source === "segment" ? ` · ${effort.splitRangeLabel}` : "";
    subtextNode.textContent = `${effort.dateLabel}${rangeText} · ${formatPaceFromSeconds(effort.averagePaceSec)}`;
}

function getDisplayBestEffort(summary, target) {
    if (target === "1K") return summary.bests.segment1k || summary.bests.fullRun1k;
    if (target === "3K") return summary.bests.segment3k || summary.bests.fullRun3k;
    if (target === "5K") return summary.bests.segment5k || summary.bests.fullRun5k;
    return summary.bests.segment10k || summary.bests.fullRun10k;
}

function formatPercentage(value) {
    return Number.isFinite(value) ? `${value.toFixed(1)}%` : "--";
}

function formatHrDelta(value) {
    if (!Number.isFinite(value)) return "--";
    if (Math.abs(value) < 0.5) return "持平";
    const direction = value > 0 ? "↑" : "↓";
    return `${direction} ${Math.abs(value).toFixed(1)} bpm`;
}

/**
 * Build the AI coach prompt string.
 */
export function buildCoachPrompt(provider, summary, highlightedRuns, detailMap) {
    const best1k = getDisplayBestEffort(summary, "1K");
    const best3k = getDisplayBestEffort(summary, "3K");
    const best5k = getDisplayBestEffort(summary, "5K");
    const best10k = getDisplayBestEffort(summary, "10K");

    const pb1k = best1k ? `${formatDuration(best1k.movingTimeSec)} (${best1k.dateLabel}${best1k.splitRangeLabel ? `, ${best1k.splitRangeLabel}` : ""}, ${formatPaceFromSeconds(best1k.averagePaceSec)})` : "尚無有效 1K 區段";
    const pb3k = best3k ? `${formatDuration(best3k.movingTimeSec)} (${best3k.dateLabel}${best3k.splitRangeLabel ? `, ${best3k.splitRangeLabel}` : ""}, ${formatPaceFromSeconds(best3k.averagePaceSec)})` : "尚無有效 3K 區段";
    const pb5k = best5k ? `${formatDuration(best5k.movingTimeSec)} (${best5k.dateLabel}${best5k.splitRangeLabel ? `, ${best5k.splitRangeLabel}` : ""}, ${formatPaceFromSeconds(best5k.averagePaceSec)})` : "尚無有效 5K 區段";
    const pb10k = best10k ? `${formatDuration(best10k.movingTimeSec)} (${best10k.dateLabel}${best10k.splitRangeLabel ? `, ${best10k.splitRangeLabel}` : ""}, ${formatPaceFromSeconds(best10k.averagePaceSec)})` : "尚無有效 10K 區段";

    let prompt = `你是我的 ${provider} 跑步教練，請用繁體中文分析以下 Strava 跑步資料。\n\n`;
    prompt += `整體摘要\n`;
    prompt += `- 本月跑量：${formatDistance(summary.totals.monthDistanceKm)}，共 ${summary.totals.monthCount} 次跑步\n`;
    prompt += `- 本週跑量：${formatDistance(summary.totals.weekDistanceKm)}，共 ${summary.totals.weekCount} 次跑步\n`;
    prompt += `- 最近 7 天跑量：${formatDistance(summary.totals.recentSevenDayDistanceKm)}\n`;
    prompt += `- 最近 4 次平均配速：${formatPaceFromSeconds(summary.totals.recentAveragePaceSec)}\n`;
    prompt += `- 最近 4 次平均心率：${summary.totals.recentAverageHr == null ? "--" : `${Math.round(summary.totals.recentAverageHr)} bpm`}\n`;
    prompt += `- 同距離配速變化：${formatDeltaPace(summary.insight.paceDeltaSec)}\n`;
    prompt += `- 訓練穩定度：${summary.totals.consistencyScore}\n`;
    prompt += `- 最佳 1K 區段：${pb1k}\n`;
    prompt += `- 最佳 3K 區段：${pb3k}\n`;
    prompt += `- 最佳 5K 區段：${pb5k}\n`;
    prompt += `- 最佳 10K 區段：${pb10k}\n`;

    if (summary.prediction) {
        prompt += `- 能力模型：${summary.prediction.model} VDOT ${summary.prediction.vdot.toFixed(1)}\n`;
        prompt += `- 預估 5K：${summary.prediction.predictions["5K"].vdotTimeLabel}\n`;
        prompt += `- 預估 10K：${summary.prediction.predictions["10K"].vdotTimeLabel}\n`;
        prompt += `- 預估半馬：${summary.prediction.predictions.Half.vdotTimeLabel}\n`;
        prompt += `- 預估全馬：${summary.prediction.predictions.Marathon.vdotTimeLabel}\n`;
        prompt += `- 模型提醒：${summary.prediction.caution}\n`;
    }

    prompt += `\n近期關鍵跑步\n`;

    highlightedRuns.forEach((run, index) => {
        const bundle = detailMap.get(run.id);
        const splits = bundle?.detail?.splits_metric || [];
        
        prompt += `${index + 1}. ${run.name}\n`;
        prompt += `   - 日期：${run.dateLabel}\n`;
        prompt += `   - 距離：${formatDistance(run.distanceKm)}\n`;
        prompt += `   - 時間：${run.movingTimeLabel}\n`;
        prompt += `   - 平均配速：${run.averagePaceLabel}\n`;
        prompt += `   - 平均心率：${run.averageHeartrate == null ? "--" : `${Math.round(run.averageHeartrate)} bpm`}\n`;
        
        if (splits.length > 0) {
            prompt += `   - 每公里 splits (前 8K)：\n`;
            splits.slice(0, 8).forEach((split) => {
                prompt += `     - ${split.split}K: ${split.average_speed ? formatPaceFromSeconds(1000 / split.average_speed) : "--"}, 心率 ${split.average_heartrate == null ? "--" : Math.round(split.average_heartrate)}\n`;
            });
        }
    });

    prompt += `\n請直接輸出：\n`;
    prompt += `1. 我目前的跑步能力分析。\n`;
    prompt += `2. 5K、10K、半馬、全馬預估成績是否合理。\n`;
    prompt += `3. 接下來 7 天的 3 次課表安排建議。\n`;

    return prompt;
}

/**
 * Render skeleton placeholders for top stats.
 */
export function renderTopStatsSkeleton() {
    const ids = [
        "month-mileage", "month-count", "week-mileage", "week-count",
        "recent-pace", "recent-hr", "acwr-score", "efficiency-score",
        "recent-cadence", "elevation-density", "pb-1k", "pb-3k", "pb-5k", "pb-10k"
    ];
    ids.forEach(id => {
        const node = document.getElementById(id);
        if (node) node.innerHTML = '<span class="skeleton" style="width: 60px; height: 1.5rem;"></span>';
    });
}

/**
 * Render skeleton placeholders for insights.
 */
export function renderInsightSkeleton() {
    const headline = document.getElementById("training-headline");
    const summary = document.getElementById("training-summary");
    if (headline) headline.innerHTML = '<span class="skeleton" style="width: 200px; height: 1.5rem;"></span>';
    if (summary) summary.innerHTML = '<span class="skeleton" style="width: 100%; height: 3rem;"></span>';

    const chips = ["recent-load", "longest-run", "pace-delta", "consistency-score", "avg-run-distance", "avg-run-duration", "quality-run-ratio", "hr-delta-trend", "long-run-share"];
    chips.forEach(id => {
        const node = document.getElementById(id);
        if (node) node.innerHTML = '<span class="skeleton" style="width: 40px; height: 1rem;"></span>';
    });
}

/**
 * Render skeleton placeholders for predictions.
 */
export function renderPredictionSkeleton() {
    const ids = ["ability-score", "pred-5k", "pred-10k", "pred-half", "pred-marathon"];
    ids.forEach(id => {
        const node = document.getElementById(id);
        if (node) node.innerHTML = '<span class="skeleton" style="width: 50px; height: 1.2rem;"></span>';
    });
    const source = document.getElementById("prediction-source");
    if (source) source.innerHTML = '<span class="skeleton" style="width: 120px; height: 1rem;"></span>';
}
