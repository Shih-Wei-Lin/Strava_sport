import { formatPaceFromSeconds } from '../utils/format.js';

/**
 * Detect interval sessions in a run from streams data.
 * Currently uses speed variance to find high-intensity blocks.
 * @param {object} streams - Strava streams object.
 * @returns {Array} List of detected intervals.
 */
export function detectIntervals(streams) {
    if (!streams?.velocity_smooth?.data || !streams?.time?.data) return [];

    const velocity = streams.velocity_smooth.data;
    const time = streams.time.data;
    const distance = streams.distance?.data || [];
    const heartrate = streams.heartrate?.data || [];
    
    // 1. Calculate average speed and threshold for intervals
    const avgVelocity = velocity.reduce((a, b) => a + b, 0) / velocity.length;
    const threshold = avgVelocity * 1.12; // 12% faster than average = potential interval
    
    const laps = [];
    let currentLap = null;

    // 2. Scan for contiguous segments above threshold
    for (let i = 0; i < velocity.length; i++) {
        const v = velocity[i];
        const isFast = v > threshold;

        if (isFast) {
            if (!currentLap) {
                currentLap = { 
                    startIndex: i, 
                    startTime: time[i], 
                    startDist: distance[i] || 0,
                    hrSum: 0,
                    hrCount: 0,
                    vDiff: 0,
                    maxV: 0
                };
            }
            if (heartrate[i]) {
                currentLap.hrSum += heartrate[i];
                currentLap.hrCount++;
            }
            currentLap.maxV = Math.max(currentLap.maxV, v);
        } else {
            if (currentLap) {
                // End current lap
                const duration = time[i] - currentLap.startTime;
                if (duration > 20) { // Min 20s for an interval
                    currentLap.endIndex = i;
                    currentLap.duration = duration;
                    currentLap.distance = (distance[i] || 0) - currentLap.startDist;
                    currentLap.avgV = currentLap.distance / duration;
                    currentLap.avgHr = currentLap.hrCount > 0 ? Math.round(currentLap.hrSum / currentLap.hrCount) : null;
                    laps.push(currentLap);
                }
                currentLap = null;
            }
        }
    }

    // Handle last lap if it was active
    if (currentLap) {
        const i = velocity.length - 1;
        const duration = time[i] - currentLap.startTime;
        if (duration > 20) {
            currentLap.endIndex = i;
            currentLap.duration = duration;
            currentLap.distance = (distance[i] || 0) - currentLap.startDist;
            currentLap.avgV = currentLap.distance / duration;
            currentLap.avgHr = currentLap.hrCount > 0 ? Math.round(currentLap.hrSum / currentLap.hrCount) : null;
            laps.push(currentLap);
        }
    }

    // 3. Format result
    return laps.map((lap, idx) => ({
        index: idx + 1,
        distanceM: Math.round(lap.distance),
        durationSec: lap.duration,
        avgPace: formatPaceFromSeconds(1000 / lap.avgV),
        avgHr: lap.avgHr,
        maxHr: null // Could also track max HR here
    }));
}
