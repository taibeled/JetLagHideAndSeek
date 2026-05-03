import { RouteType } from "./types"

export const Attributes = {
    arrival_time: 'arrival_time',
    departure_time: 'departure_time',
}

export const Pagination = {
    first: 'first',
    next: 'next',
    prev: 'prev',
    last: 'last',
}

export const LIGHT_HEAVY_RAIL_TYPES = [
    RouteType.LIGHT_RIAL,
    RouteType.SUBWAY
];
