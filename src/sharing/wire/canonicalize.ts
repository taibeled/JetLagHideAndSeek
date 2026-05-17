export function canonicalize(value: unknown): string {
    return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortValue);
    }

    if (value && typeof value === "object") {
        const output: Record<string, unknown> = {};
        for (const key of Object.keys(value).sort()) {
            const nextValue = (value as Record<string, unknown>)[key];
            if (nextValue !== undefined) {
                output[key] = sortValue(nextValue);
            }
        }
        return output;
    }

    return value;
}
