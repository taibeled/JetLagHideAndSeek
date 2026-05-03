import { Pagination } from "./constants";
import { selectIncluded, selectPage } from "./selectors";
import { arrivalsWithConversion, buildUrl, departuresWithConversion } from "./utils";

type QueryParams = Record<string, unknown>;

export class MBTA {
    apiKey: string;
    logger: Console;


    constructor(apiKey: string, logger = console) {
        this.apiKey = apiKey;
        this.logger = logger;
    }

    _fetch<T = unknown>(endpoint: string) {
        return async (queryParams?: QueryParams) => {
            const response = await fetch(buildUrl(endpoint, queryParams, this.apiKey, this.logger))
            const data = await response.json();
            return data as T;
        }
    }

    fetchStops = this._fetch('/stops');
    fetchTrips = this._fetch('/trips');
    fetchLines = this._fetch('/lines');
    fetchAlerts = this._fetch('/alerts');
    fetchShapes = this._fetch('/shapes');
    fetchRoutes = this._fetch('/routes');
    fetchServices = this._fetch('/services');
    fetchVehicles = this._fetch('/vehicles');
    fetchSchedules = this._fetch('/schedules');
    fetchFacilities = this._fetch('/facilities');
    fetchPredictions = this._fetch('/predictions');
    fetchRoutePatterns = this._fetch('/route_patterns');
    fetchLiveFacilities = this._fetch('/live_facilities');

    async fetchAllRoutes(filters: QueryParams) {
        const routes: any = await this.fetchRoutes(filters);
        return routes.map((route: any) => {
            const { short_name } = route.attributes;
            return {
                // Only include short_name if it exists and is different from `id`
                ...(short_name && short_name !== route.id ? { short_name } : {}),
                id: route.id,
                long_name: route.attributes.long_name,
                direction_names: route.attributes.direction_names,
            };
        });
    }

    async fetchStopsByRoute(route: any) {
        const stops: any = await this.fetchStops({ route });
        return stops.map((stop: any) => ({
            name: stop.attributes.name,
            id: stop.id,
        }));
    }

    async fetchStopsByName(name: string, exact?: boolean) {
        const allStops: any = await this.fetchStops();
        const normalizedName = name.trim().toLowerCase();
        return allStops.filter((stop: any) => {
            if (exact) {
                return stop.attributes.name.toLowerCase() === normalizedName;
            }
            return stop.attributes.name.toLowerCase().match(normalizedName);
        });
    }

    /**
   * Select arrival/departure times from predictions with options to limit
   * the number of arrivals returned, and convert them to time from now
   */
    selectArrivals(response: any, { convertTo, now } = {}) {
        return arrivalsWithConversion({ response, convertTo, now });
    }

    selectDepartures(response: any, { convertTo, now } = {}) {
        return departuresWithConversion({ response, convertTo, now });
    }

    /**
     * Select included objects by type. An array of types will return
     * objects matching any of the specified types. Omitting 'type'
     * will return the unfiltered 'included' array.
     */
    selectIncluded(response: any, type: any) {
        return selectIncluded(response, type);
    }

    /**
     * Helper functions to fetch pages when working
     * with a response that includes paginated links
     */
    async fetchFirstPage(response: any) {
        return this._fetch(selectPage(Pagination.first, response));
    }

    async fetchNextPage(response: any) {
        return this._fetch(selectPage(Pagination.next, response));
    }

    async fetchPrevPage(response: any) {
        return this._fetch(selectPage(Pagination.prev, response));
    }

    async fetchLastPage(response: any) {
        return this._fetch(selectPage(Pagination.last, response));
    }
}

export const mbtaClient = new MBTA(import.meta.env.PUBLIC_MBTA_APIKEY, console)
