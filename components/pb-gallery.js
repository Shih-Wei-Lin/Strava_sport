import { formatDuration, formatPaceFromSeconds } from '../analytics.js';

/**
 * Render the Personal Best gallery.
 * @param {object} summary - Activity summary data.
 */
export function renderPbGallery(summary) {
    const container = document.getElementById("pb-gallery-container");
    if (!container || !summary?.bests) return;

    const pbTypes = [
        { key: "segment1k", label: "1K 最佳", icon: "⚡" },
        { key: "segment3k", label: "3K 最佳", icon: "🔥" },
        { key: "segment5k", label: "5K 最佳", icon: "⭐" },
        { key: "segment10k", label: "10K 最佳", icon: "💎" },
        { key: "fullRun1k", label: "1K 全程最快", icon: "💨" },
        { key: "fullRun5k", label: "5K 全程最快", icon: "🎖️" }
    ];

    const html = pbTypes.map(pb => {
        const effort = summary.bests[pb.key];
        if (!effort) return "";

        return `
            <div class="pb-card">
                <div class="pb-card-header">
                    <span class="pb-card-icon">${pb.icon}</span>
                    <span class="pb-card-label">${pb.label}</span>
                </div>
                <div class="pb-card-value">${formatDuration(effort.movingTimeSec)}</div>
                <div class="pb-card-meta">
                    <span>${effort.dateLabel}</span>
                    <span>${formatPaceFromSeconds(effort.averagePaceSec)} /km</span>
                </div>
                <div class="pb-card-source">${effort.runName}</div>
            </div>
        `;
    }).join("");

    const maxElevation = summary.runs && summary.runs.length > 0 
        ? Math.max(...summary.runs.map(r => r.totalElevationGain || 0)) 
        : 0;

    const totalsHtml = `
        <div class="pb-totals">
            <div class="pb-total-item">
                <span class="label">最長距離</span>
                <span class="value">${summary.totals.longestRunKm.toFixed(2)} km</span>
            </div>
            <div class="pb-total-item">
                <span class="label">最高爬升</span>
                <span class="value">${Math.round(maxElevation)} m</span>
            </div>
        </div>
    `;

    container.innerHTML = `
        <div class="pb-gallery">
            ${totalsHtml}
            <div class="pb-grid">
                ${html || '<p class="empty-state">尚無紀錄資料</p>'}
            </div>
        </div>
    `;
}

/**
 * Render the PB gallery skeleton.
 */
export function renderPbSkeleton() {
    const container = document.getElementById("pb-gallery-container");
    if (!container) return;

    const items = Array.from({ length: 6 }).map(() => `
        <div class="pb-card skeleton">
            <div class="pb-card-header">
                <div class="pb-card-icon skeleton"></div>
                <div class="pb-card-label skeleton skeleton-text"></div>
            </div>
            <div class="pb-card-value skeleton skeleton-text"></div>
            <div class="pb-card-meta">
                <div class="skeleton-text"></div>
                <div class="skeleton-text"></div>
            </div>
            <div class="pb-card-source skeleton skeleton-text"></div>
        </div>
    `).join("");

    container.innerHTML = `
        <div class="pb-gallery">
            <div class="pb-totals">
                <div class="pb-total-item skeleton-text"></div>
                <div class="pb-total-item skeleton-text"></div>
            </div>
            <div class="pb-grid">
                ${items}
            </div>
        </div>
    `;
}
