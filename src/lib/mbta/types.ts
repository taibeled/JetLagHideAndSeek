export enum RouteType {
    TRAM = "tram",
    LIGHT_RIAL = "light rail",
    STREET_CAR = "streetcar",
    TROLLER = "trolley",
    SUBWAY = "subway",
    METRO = "metro",
    TRAIN = "train"
};

export type LatLng = [number, number];

export type Stop = {
    lat: number;
    lng: number;
    name: string;
    description: string;
}