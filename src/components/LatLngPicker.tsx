import { toast } from "react-toastify";
import {
    MENU_ITEM_CLASSNAME,
    SidebarMenuButton,
    SidebarMenuItem,
} from "./ui/sidebar-l";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/select";
import { isLoading } from "@/lib/context";

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
                <Select
                    onValueChange={(value) =>
                        onChange(
                            value === "north"
                                ? Math.abs(latitude)
                                : -Math.abs(latitude),
                            null,
                        )
                    }
                    value={latitude > 0 ? "north" : "south"}
                    disabled={disabled}
                >
                    <SelectTrigger className="max-w-[55px]">
                        <SelectValue placeholder="Direction"></SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="north">N</SelectItem>
                        <SelectItem value="south">S</SelectItem>
                    </SelectContent>
                </Select>
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
                <Select
                    onValueChange={(value) =>
                        onChange(
                            null,
                            value === "east"
                                ? Math.abs(longitude)
                                : -Math.abs(longitude),
                        )
                    }
                    value={longitude > 0 ? "east" : "west"}
                    disabled={disabled}
                >
                    <SelectTrigger className="max-w-[55px]">
                        <SelectValue placeholder="Direction"></SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="east">E</SelectItem>
                        <SelectItem value="west">W</SelectItem>
                    </SelectContent>
                </Select>
            </SidebarMenuItem>
            <SidebarMenuItem>
                <SidebarMenuButton
                    className="bg-blue-600 p-2 rounded-md font-semibold font-poppins transition-shadow duration-500"
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
            </SidebarMenuItem>
            {children}
        </>
    );
};
