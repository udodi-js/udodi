function percentile(sortedValues, percentage) {
    if (sortedValues.length === 1) {
        return sortedValues[0];
    }

    const position = (sortedValues.length - 1) * percentage;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);

    if (lower === upper) {
        return sortedValues[lower];
    }

    return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
}

export function summarize(values) {
    if (!Array.isArray(values) || values.length === 0 || values.some((value) => !Number.isFinite(value))) {
        throw new Error("Statistics require a non-empty array of finite numbers");
    }

    const sortedValues = [...values].sort((left, right) => left - right);
    const average = values.reduce((total, value) => total + value, 0) / values.length;
    const variance = values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length;

    return {
        count: values.length,
        mean: average,
        median: percentile(sortedValues, 0.5),
        min: sortedValues[0],
        max: sortedValues[sortedValues.length - 1],
        stdDev: Math.sqrt(variance),
        p95: percentile(sortedValues, 0.95),
        p99: percentile(sortedValues, 0.99),
    };
}
