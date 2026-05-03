import { Attributes } from "./constants";

export const selectAttribute = attr => response => {
    if (!response || !response.data) {
        console.warn('No response data...');
        return [];
    }

    return response.data.map(vehicle => vehicle.attributes[attr]);
};

export const selectLinks = response => {
    if (!response) {
        throw new Error('No response, fetch data before accessing this value');
    }
    if (!response.links) {
        throw new Error('response.links does not exist, "limit" must be in fetch options');
    }
    return response.links;
};

export const selectIncluded = (response, type) => {
    if (!response) {
        throw new Error('included() requires an MBTA response as an argument');
    }
    if (!response.included) {
        console.warn('response.included does not exist, "include" must be in fetch options');
        return [];
    }
    return response.included.filter(inc => {
        if (Array.isArray(type)) {
            return type.includes(inc.type);
        }
        return type === inc.type || type == null;
    });
};

export const selectPage = (page, response) => selectLinks(response)[page];

export const selectArrivalISOs = selectAttribute(Attributes.arrival_time);
export const selectDepartureISOs = selectAttribute(Attributes.departure_time);