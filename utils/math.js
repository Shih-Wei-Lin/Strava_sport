export function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function average(values) {
    const filtered = values.filter((value) => Number.isFinite(value));
    if (filtered.length === 0) {
        return null;
    }

    return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

export function median(values) {
    const filtered = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
    if (filtered.length === 0) {
        return null;
    }

    const middle = Math.floor(filtered.length / 2);
    if (filtered.length % 2 === 1) {
        return filtered[middle];
    }

    return (filtered[middle - 1] + filtered[middle]) / 2;
}
