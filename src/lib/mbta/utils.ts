import { selectArrivalISOs, selectDepartureISOs } from "./selectors";
import { RouteType, type LatLng, type Type } from "./types";

const isoRegex = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}).000Z/;

const exists = (value) => value != null && value !== '';

const isEmptyArray = (array) =>
    Array.isArray(array) && !array.filter(Boolean).length;

const BASE_URL = 'https://api-v3.mbta.com';

// CONVERSION FUNCTIONS

/**
 * Converts array or string into comma separated string
 * @param {string | Array} value
 */
export const commaSeparate = (value) =>
    [].concat(value).filter(Boolean).join(',').replace(/,\s/g, ',');

/**
 * Convert MS to given time units
 * @param {number} ms
 * @param {string} convertTo Time unit to convert MS to
 */
export const convertMs = (ms, convertTo) => {
    if (!exists(convertTo)) return ms;

    const conversionMap = {
        // Order here is important, because 'sec' input will
        // match 'milliseconds' if it's before 'seconds'
        'hours|hrs': 1000 * 60 * 60,
        'minutes|mins': 1000 * 60,
        'seconds|secs': 1000,
        'ms|milliseconds': 1,
    };

    const converted = Object.keys(conversionMap).find((unit) =>
        new RegExp(convertTo, 'i').test(unit)
    );

    if (!exists(converted)) {
        throw new Error(`Invalid 'convertTo' value: ${convertTo}`);
    }

    return ms / conversionMap[converted];
};

/**
 * Convert an array of ISO strings to <units> from now
 * @param {function} selector Select array of ISO times from response object
 */
export const convertTimes = (selector) => (options) => {
    const { response, max, convertTo, now = Date.now() } = options;

    return selector(response)
        .slice(0, max)
        .map((isoString) => {
            // Note: arrival could be null if first stop on a route. Use departures
            // if it's not null. Departure could be null if final stop on a route
            // See https://www.mbta.com/developers/v3-api/best-practices for more info
            if (convertTo == null || isoString == null) return isoString;

            const msFromNow = new Date(isoString).valueOf() - now;
            const unitsFromNow = Math.floor(convertMs(msFromNow, convertTo));

            return unitsFromNow >= 0 ? unitsFromNow : 0;
        });
};

export const arrivalsWithConversion = convertTimes(selectArrivalISOs);
export const departuresWithConversion = convertTimes(selectDepartureISOs);

// NORMALIZATION FUNCTIONS

/**
 * Takes any kind of input, returns an ISO string.
 * Throws if input is malformed.
 * @param {number | string | Date} value
 */
export const normalizeDate = (value) => new Date(value).toISOString();

/**
 * Handles number or string input and returns numeric type based on:
 * https://developers.google.com/transit/gtfs/reference/routes-file
 * @param {string} type
 */
export const normalizeType = (type: string) => {
    const typesMap = {
        [RouteType.TRAM]: 0,
        [RouteType.LIGHT_RIAL]: 0,
        [RouteType.STREET_CAR]: 0,
        [RouteType.TROLLER]: 0,
        [RouteType.SUBWAY]: 1,
        [RouteType.METRO]: 1,
        [RouteType.TRAIN]: 1,
        // rail: 2,
        // commuter: 2,
        // 'commuter rail': 2,
        // bus: 3,
        // autobus: 3,
        // ferry: 4,
        // boat: 4,
        // 'cable car': 5,
        // gondola: 6,
        // 'suspended cable car': 6,
        // funicular: 7,
    };

    const typeAsNum = Number(type);

    const MAX_TYPE = 7;

    if (!exists(type) || typeAsNum >= MAX_TYPE || typeAsNum < 0) {
        console.warn(`Invalid type: ${type}`);
        return null;
    }
    // If typeAsNum === typeAsNum, `type` is a number, else a string like 'bus'
    // eslint-disable-next-line
    if (typeAsNum === typeAsNum) {
        return typeAsNum.toString();
    }
    const mbtaType = typesMap[type.toLowerCase()];
    return exists(mbtaType) ? mbtaType.toString() : null;
};

export const addApiKey = (url, apiKey, logger) => {
    if (!exists(apiKey)) {
        logger.warn(
            'API key is missing. Keys available at https://api-v3.mbta.com'
        );
        return `${url}`;
    }
    const delimiter = url.includes('?') ? '&' : '?';
    return `${url}${delimiter}api_key=${apiKey}`;
};

/**
 * Warn if query params are invalid
 * @param {string} endpoint
 * @param {object} queryParams Specific to each endpoint
 */
export function warnForQueryParams(endpoint, queryParams) {
    const {
        limit,
        offset,
        latitude,
        longitude,
        descending,
        min_time,
        max_time,
        radius,
        route,
        stop,
        sort,
        trip,
    } = queryParams;

    const matchRoute = (test) => test === endpoint;

    if (
        (matchRoute('/predictions') || matchRoute('/schedules')) &&
        !exists(stop) &&
        !exists(trip) &&
        !exists(route)
    ) {
        console.warn('Please include "stop", "trip", or "route"');
    }

    if (matchRoute('/shapes') && !exists(route)) {
        console.warn('Shape requires a "route" param');
    }

    if (exists(offset) && !exists(limit)) {
        console.warn('"offset" will have no effect without "limit"');
    }

    if (
        (exists(latitude) && !exists(longitude)) ||
        (!exists(latitude) && exists(longitude))
    ) {
        console.warn('Latitude and longitude must both be present');
    }

    if (exists(radius) && (!exists(latitude) || !exists(longitude))) {
        console.warn('Radius requires latitude and longitude');
    }

    if (exists(descending) && !exists(sort)) {
        console.warn('"descending" has no effect without "sort"');
    }

    [min_time, max_time].forEach((minMax) => {
        if (exists(minMax) && !/^\d{2}:\d{2}/.test(minMax)) {
            console.warn('min_time and max_time format should be HH:MM');
        }
    });
}

/**
 * URL construction function
 * @param {string} endpoint
 * @param {object} queryParams Specific to each endpoint
 * @param {string} apiKey
 */
export function buildUrl(endpoint: string, queryParams: any, apiKey: string, logger = console) {
    const url = BASE_URL + endpoint;

    if (!endpoint) {
        throw new Error(
            'Please provide an endpoint. See https://api-v3.mbta.com/docs/swagger/index.html'
        );
    }

    if (!queryParams || !Object.keys(queryParams).length) {
        return addApiKey(url, apiKey, logger);
    }

    warnForQueryParams(endpoint, queryParams);

    // Convert queryParams into string values for URL
    const queryString = Object.entries(queryParams)
        .map(([key, value]) => {
            let finalValue;
            switch (key) {
                case 'sort':
                    return queryParams.descending ? `sort=-${value}` : `sort=${value}`;
                case 'limit':
                case 'offset':
                    return `page[${key}]=${value}`;
                case 'date':
                    finalValue = [].concat(value).map(normalizeDate);
                    break;
                case 'route_type':
                case 'type':
                    finalValue = [].concat(value).map(normalizeType);
                    break;
                default:
                    finalValue = value;
            }

            if (!exists(finalValue) || isEmptyArray(finalValue)) {
                return null;
            }

            // MBTA docs say to use filter[stop], filter[route], etc, but they
            // also support stop, route, etc. without filter
            return `${key}=${commaSeparate(finalValue)}`;
        })
        // Filter out falsy values, and 'descending' since it's only used for 'sort' logic
        .filter((param) => !!param && !/descending/.test(param))
        .join('&');

    return addApiKey(`${url}?${queryString}`, apiKey, logger);
}

export function decodePolyline(encoded: string) {
    const points: LatLng[] = []
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;
    while (index < len) {
        var b, shift = 0, result = 0;
        do {
            b = encoded.charAt(index++).charCodeAt(0) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlat = ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
        lat += dlat;
        shift = 0;
        result = 0;
        do {
            b = encoded.charAt(index++).charCodeAt(0) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlng = ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
        lng += dlng;
        points.push([(lat / 1E5), (lng / 1E5)])
    }
    return points
};
