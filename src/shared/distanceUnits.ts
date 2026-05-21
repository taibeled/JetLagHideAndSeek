export type DistanceUnit = "m" | "km" | "mi";

export const METERS_PER_KM = 1000;
export const METERS_PER_MILE = 1609.344;

export function toMeters(value: string, unit: DistanceUnit): number | null {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return null;

    if (unit === "km") return numericValue * METERS_PER_KM;
    if (unit === "mi") return numericValue * METERS_PER_MILE;
    return numericValue;
}

export function fromMeters(meters: number, unit: DistanceUnit): string {
    const value =
        unit === "km"
            ? meters / METERS_PER_KM
            : unit === "mi"
              ? meters / METERS_PER_MILE
              : meters;
    return formatDistanceValue(value);
}

export function formatDistanceValue(value: number, precision?: number): string {
    if (Math.abs(value - Math.round(value)) < 0.000001) {
        return String(Math.round(value));
    }
    if (precision !== undefined) return value.toFixed(precision);
    if (value >= 10) return value.toFixed(1);
    return value.toFixed(2);
}
