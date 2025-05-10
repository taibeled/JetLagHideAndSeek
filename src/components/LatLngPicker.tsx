import { toast } from "react-toastify";
import {
    MENU_ITEM_CLASSNAME,
    SidebarMenuButton,
    SidebarMenuItem,
} from "./ui/sidebar-l";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isLoading } from "@/lib/context";
import { Button } from "./ui/button";

const parseCoordinatesFromText = (
    text: string,
): { lat: number | null; lng: number | null } => {
    // Format: decimal degrees (e.g., 37.7749, -122.4194 or 37,7749, -122,4194)
    const decimalPattern = /(-?\d+[.,]\d+)\s*,\s*(-?\d+[.,]\d+)/;

    // Format: degrees, minutes, seconds (e.g., 37°46'26"N, 122°25'10"W)
    const dmsPattern =
        /(\d+)°\s*(\d+)['′]?\s*(?:(\d+(?:\.\d+)?)["″]?\s*)?([NS])[,\s]+(\d+)°\s*(\d+)['′]?\s*(?:(\d+(?:\.\d+)?)["″]?\s*)?([EW])/i;

    // Format: decimal degrees with cardinal directions (e.g., 48,89607° N, 9,09885° E or 48.89607° N, 9.09885° E)
    const decimalCardinalPattern =
        /(\d+[.,]\d+)°\s*([NS])\s*,\s*(\d+[.,]\d+)°\s*([EW])/i;

    const decimalMatch = text.match(decimalPattern);
    if (decimalMatch) {
        return {
            lat: parseFloat(decimalMatch[1].replace(",", ".")),
            lng: parseFloat(decimalMatch[2].replace(",", ".")),
        };
    }

    const dmsMatch = text.match(dmsPattern);
    if (dmsMatch) {
        let lat =
            parseInt(dmsMatch[1]) +
            parseInt(dmsMatch[2]) / 60 +
            (parseFloat(dmsMatch[3]) || 0) / 3600;
        let lng =
            parseInt(dmsMatch[5]) +
            parseInt(dmsMatch[6]) / 60 +
            (parseFloat(dmsMatch[7]) || 0) / 3600;

        if (dmsMatch[4].toUpperCase() === "S") lat = -lat;
        if (dmsMatch[8].toUpperCase() === "W") lng = -lng;

        return { lat, lng };
    }

    const decimalCardinalMatch = text.match(decimalCardinalPattern);
    if (decimalCardinalMatch) {
        let lat = parseFloat(decimalCardinalMatch[1].replace(",", "."));
        let lng = parseFloat(decimalCardinalMatch[3].replace(",", "."));

        if (decimalCardinalMatch[2].toUpperCase() === "S") lat = -lat;
        if (decimalCardinalMatch[4].toUpperCase() === "W") lng = -lng;

        return { lat, lng };
    }

    return { lat: null, lng: null };
};

export const LatitudeLongitude = ({
    latitude,
    longitude,
    onChange,
    latLabel = "Latitude",
    lngLabel = "Longitude",
    children,
    disabled,
}: {
    latitude: number;
    longitude: number;
    onChange: (lat: number | null, lng: number | null) => void;
    latLabel?: string;
    lngLabel?: string;
    className?: string;
    children?: React.ReactNode;
    disabled?: boolean;
}) => {
    return (
        <>
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <Label className="leading-5">{latLabel}</Label>
                <Input
                    type="number"
                    value={Math.abs(latitude)}
                    min={0}
                    max={90}
                    onChange={(e) => {
                        if (isNaN(parseFloat(e.target.value))) return;

                        onChange(
                            parseFloat(e.target.value) *
                                (latitude !== 0 ? Math.sign(latitude) : -1),
                            null,
                        );
                    }}
                    disabled={disabled}
                />
                <Button
                    variant="outline"
                    onClick={() => onChange(-latitude, null)}
                >
                    {latitude > 0 ? "N" : "S"}
                </Button>
            </SidebarMenuItem>
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <Label className="leading-5">{lngLabel}</Label>
                <Input
                    type="number"
                    value={Math.abs(longitude)}
                    min={0}
                    max={180}
                    onChange={(e) => {
                        if (isNaN(parseFloat(e.target.value))) return;

                        onChange(
                            null,
                            parseFloat(e.target.value) *
                                (longitude !== 0 ? Math.sign(longitude) : -1),
                        );
                    }}
                    disabled={disabled}
                />
                <Button
                    variant="outline"
                    onClick={() => onChange(null, -longitude)}
                >
                    {longitude > 0 ? "E" : "W"}
                </Button>
            </SidebarMenuItem>
            <SidebarMenuItem className="flex gap-2">
                <SidebarMenuButton
                    className="bg-blue-600 p-2 rounded-md font-semibold font-poppins transition-colors duration-500 flex justify-center"
                    onClick={() => {
                        if (!navigator || !navigator.geolocation)
                            return alert("Geolocation not supported");

                        isLoading.set(true);

                        toast.promise(
                            new Promise<GeolocationPosition>(
                                (resolve, reject) => {
                                    navigator.geolocation.getCurrentPosition(
                                        resolve,
                                        reject,
                                        {
                                            maximumAge: 0,
                                            enableHighAccuracy: true,
                                        },
                                    );
                                },
                            )
                                .then((position) => {
                                    onChange(
                                        position.coords.latitude,
                                        position.coords.longitude,
                                    );
                                })
                                .finally(() => {
                                    isLoading.set(false);
                                }),
                            {
                                pending: "Fetching location",
                                success: "Location fetched",
                                error: "Could not fetch location",
                            },
                            { autoClose: 500 },
                        );
                    }}
                    disabled={disabled}
                >
                    Current
                </SidebarMenuButton>
                <SidebarMenuButton
                    className="bg-blue-600 p-2 rounded-md font-semibold font-poppins transition-colors duration-500 flex justify-center"
                    onClick={() => {
                        if (!navigator || !navigator.clipboard) {
                            toast.error(
                                "Clipboard API not supported in your browser",
                            );
                            return;
                        }

                        toast.promise(
                            navigator.clipboard.writeText(
                                `${Math.abs(latitude)}°${latitude > 0 ? "N" : "S"}, ${Math.abs(
                                    longitude,
                                )}°${longitude > 0 ? "E" : "W"}`,
                            ),
                            {
                                pending: "Writing to clipboard...",
                                success: "Coordinates copied!",
                                error: "An error occurred while copying",
                            },
                            { autoClose: 1000 },
                        );
                    }}
                    disabled={disabled}
                >
                    Copy
                </SidebarMenuButton>
                <SidebarMenuButton
                    className="bg-blue-600 p-2 rounded-md font-semibold font-poppins transition-colors duration-500 flex justify-center"
                    onClick={() => {
                        if (!navigator || !navigator.clipboard) {
                            toast.error(
                                "Clipboard API not supported in your browser",
                            );
                            return;
                        }

                        isLoading.set(true);

                        toast.promise(
                            navigator.clipboard
                                .readText()
                                .then((text) => {
                                    const coords =
                                        parseCoordinatesFromText(text);
                                    if (
                                        coords.lat !== null &&
                                        coords.lng !== null
                                    ) {
                                        onChange(coords.lat, coords.lng);
                                        return;
                                    }
                                    throw new Error(
                                        "Could not find coordinates in clipboard content",
                                    );
                                })
                                .finally(() => {
                                    isLoading.set(false);
                                }),
                            {
                                pending: "Reading from clipboard",
                                success: "Coordinates set from clipboard",
                                error: "No valid coordinates found in clipboard",
                            },
                            { autoClose: 1000 },
                        );
                    }}
                    disabled={disabled}
                >
                    Paste
                </SidebarMenuButton>
            </SidebarMenuItem>
            {children}
        </>
    );
};
