import { useStore } from "@nanostores/react";
import {
    ClipboardCopyIcon,
    ClipboardPasteIcon,
    EditIcon,
    LocateIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebounce } from "@/hooks/useDebounce";
import { isLoading } from "@/lib/context";
import { cn } from "@/lib/utils";
import { determineName, geocode, ICON_COLORS } from "@/maps/api";

import { Button } from "./ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "./ui/command";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "./ui/dialog";
import { SidebarMenuItem } from "./ui/sidebar-l";

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

const LatLngEditForm = ({
    latitude,
    longitude,
    onChange,
    disabled,
}: {
    latitude: number;
    longitude: number;
    onChange: (lat: number | null, lng: number | null) => void;
    disabled?: boolean;
}) => {
    const [inputValue, setInputValue] = useState("");
    const debouncedValue = useDebounce<string>(inputValue);
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (debouncedValue === "") {
            setResults([]);
            return;
        } else {
            setLoading(true);
            setResults([]);
            geocode(debouncedValue, "en", false)
                .then((x) => {
                    setResults(x);
                    setLoading(false);
                })
                .catch(() => {
                    setError(true);
                    setLoading(false);
                });
        }
    }, [debouncedValue]);

    const _latlngLabels = results.map((r) => determineName(r));
    const _latlngLabelCounts: Record<string, number> = {};
    _latlngLabels.forEach((l) => {
        _latlngLabelCounts[l] = (_latlngLabelCounts[l] || 0) + 1;
    });
    const _latlngLabelByKey: Record<string, string> = {};
    const _latlngOcc: Record<string, number> = {};
    results.forEach((r) => {
        const key = `${r.properties.osm_id}${r.properties.name}`;
        const lbl = determineName(r);
        const idx = (_latlngOcc[lbl] = (_latlngOcc[lbl] || 0) + 1);
        _latlngLabelByKey[key] =
            _latlngLabelCounts[lbl] > 1 ? `${lbl} (${idx})` : lbl;
    });

    return (
        <>
            <Command shouldFilter={false}>
                <CommandInput
                    placeholder="Search place..."
                    onKeyUp={(x) => setInputValue(x.currentTarget.value)}
                    disabled={disabled}
                />
                <CommandList>
                    <CommandEmpty>
                        {loading
                            ? "Loading..."
                            : error
                              ? "Error loading places."
                              : "No locations found."}
                    </CommandEmpty>
                    <CommandGroup>
                        {results.map((result) => (
                            <CommandItem
                                key={`${result.properties.osm_id}${result.properties.name}`}
                                onSelect={() => {
                                    const coords = result.geometry.coordinates;
                                    onChange(coords[0], coords[1]);
                                }}
                                className="cursor-pointer"
                            >
                                {(() => {
                                    const _key = `${result.properties.osm_id}${result.properties.name}`;
                                    return (
                                        _latlngLabelByKey[_key] ||
                                        determineName(result)
                                    );
                                })()}
                            </CommandItem>
                        ))}
                    </CommandGroup>
                </CommandList>
            </Command>
            <div className="flex gap-2 items-center">
                <Label className="min-w-16">Latitude</Label>
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
                    disabled={disabled}
                >
                    {latitude > 0 ? "N" : "S"}
                </Button>
            </div>
            <div className="flex gap-2 items-center">
                <Label className="min-w-16">Longitude</Label>
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
                    disabled={disabled}
                >
                    {longitude > 0 ? "E" : "W"}
                </Button>
            </div>
        </>
    );
};

export const LatitudeLongitude = ({
    latitude,
    longitude,
    onChange,
    label = "Location",
    colorName,
    children,
    disabled,
    inlineEdit = false,
}: {
    latitude: number;
    longitude: number;
    onChange: (lat: number | null, lng: number | null) => void;
    label?: string;
    colorName?: keyof typeof ICON_COLORS;
    className?: string;
    children?: React.ReactNode;
    disabled?: boolean;
    inlineEdit?: boolean;
}) => {
    const $isLoading = useStore(isLoading);

    const color = colorName ? ICON_COLORS[colorName] : "transparent";

    return (
        <>
            <SidebarMenuItem
                style={{
                    backgroundColor: color,
                }}
                className={cn(
                    "p-2 rounded-md space-y-1 mt-2",
                    $isLoading && "brightness-50",
                )}
            >
                {!inlineEdit && (
                    <div
                        className={cn(
                            "flex justify-between items-center",
                            $isLoading && "opacity-50",
                        )}
                        style={{
                            color: colorName === "gold" ? "black" : undefined,
                        }}
                    >
                        <div className="text-2xl font-semibold font-poppins">
                            {label}
                        </div>
                        <div className="tabular-nums text-right text-sm font-oxygen">
                            <div>
                                {Math.abs(latitude).toFixed(5)}
                                {"° "}
                                {latitude > 0 ? "N" : "S"}
                            </div>
                            <div>
                                {Math.abs(longitude).toFixed(5)}
                                {"° "}
                                {longitude > 0 ? "E" : "W"}
                            </div>
                        </div>
                    </div>
                )}

                <div
                    className={cn(
                        !inlineEdit &&
                            "flex justify-center gap-2 *:max-w-12 *:w-[20%]",
                    )}
                >
                    {inlineEdit ? (
                        <div className="flex flex-col gap-2 w-full mb-2">
                            <LatLngEditForm
                                latitude={latitude}
                                longitude={longitude}
                                onChange={onChange}
                                disabled={disabled}
                            />
                        </div>
                    ) : (
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button
                                    disabled={disabled}
                                    variant="outline"
                                    title="Edit coordinates"
                                >
                                    <EditIcon />
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle className="text-2xl">
                                        Update {label}
                                    </DialogTitle>
                                </DialogHeader>
                                <LatLngEditForm
                                    latitude={latitude}
                                    longitude={longitude}
                                    onChange={onChange}
                                    disabled={disabled}
                                />
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button>Done</Button>
                                    </DialogClose>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
                    <div
                        className={
                            inlineEdit
                                ? "flex justify-center gap-2"
                                : "contents"
                        }
                    >
                        <Button
                            variant="outline"
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
                            title="Set to current location"
                        >
                            <LocateIcon />
                        </Button>
                        <Button
                            variant="outline"
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
                                                onChange(
                                                    coords.lat,
                                                    coords.lng,
                                                );
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
                                        success:
                                            "Coordinates set from clipboard",
                                        error: "No valid coordinates found in clipboard",
                                    },
                                    { autoClose: 1000 },
                                );
                            }}
                            disabled={disabled}
                            title="Paste coordinates from clipboard"
                        >
                            <ClipboardPasteIcon />
                        </Button>
                        <Button
                            variant="outline"
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
                            title="Copy coordinates to clipboard"
                        >
                            <ClipboardCopyIcon />
                        </Button>
                    </div>
                </div>
            </SidebarMenuItem>
            {children}
        </>
    );
};
