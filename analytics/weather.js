/**
 * Analyze heart rate and temperature correlation from streams.
 * Helps identify HR drift due to heat.
 * @param {object} streams - Strava streams object.
 * @returns {object|null} Weather analysis results.
 */
export function analyzeWeatherImpact(streams) {
    if (!streams?.temp?.data || !streams?.heartrate?.data) return null;

    const temp = streams.temp.data;
    const heartrate = streams.heartrate.data;
    const velocity = streams.velocity_smooth?.data || [];
    
    // 1. Calculate basic stats
    const avgTemp = temp.reduce((a, b) => a + b, 0) / temp.length;
    const maxTemp = Math.max(...temp);
    
    // 2. Correlation - Pearson Correlation Coefficient
    // Only correlating when velocity is over 1.0 m/s (running, not stopped)
    const validIndices = velocity.map((v, i) => v > 1.0 ? i : -1).filter(i => i !== -1);
    
    if (validIndices.length < 30) return { avgTemp, maxTemp, correlation: 0 };

    const hrSubset = validIndices.map(i => heartrate[i]);
    const tempSubset = validIndices.map(i => temp[i]);

    const correlation = calculateCorrelation(hrSubset, tempSubset);

    return {
        avgTemp: Math.round(avgTemp * 10) / 10,
        maxTemp: Math.round(maxTemp * 10) / 10,
        correlation: Math.round(correlation * 100) / 100,
        impactScore: correlation > 0.6 ? '高' : (correlation > 0.3 ? '中' : '低')
    };
}

function calculateCorrelation(X, Y) {
    const n = X.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    
    for (let i = 0; i < n; i++) {
        sumX += X[i];
        sumY += Y[i];
        sumXY += X[i] * Y[i];
        sumX2 += X[i] * X[i];
        sumY2 += Y[i] * Y[i];
    }
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    if (denominator === 0) return 0;
    return numerator / denominator;
}
