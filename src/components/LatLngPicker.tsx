import { toast } from "react-toastify";
import {
    MENU_ITEM_CLASSNAME,
    SidebarMenuButton,
    SidebarMenuItem,
} from "./ui/sidebar-l";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const LatitudeLongitude = ({
    latitude,
    longitude,
    onChange,
    latLabel = "Latitude",
    lngLabel = "Longitude",
    children,
}: {
    latitude: number;
    longitude: number;
    onChange: (lat: number | null, lng: number | null) => void;
    latLabel?: string;
    lngLabel?: string;
    className?: string;
    children?: React.ReactNode;
}) => {
    return (
        <>
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <Label className="leading-5">{latLabel}</Label>
                <Input
                    type="number"
                    value={latitude}
                    onChange={(e) => {
                        onChange(parseFloat(e.target.value), null);
                    }}
                />
            </SidebarMenuItem>
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <Label className="leading-5">{lngLabel}</Label>
                <Input
                    type="number"
                    value={longitude}
                    onChange={(e) => {
                        onChange(null, parseFloat(e.target.value));
                    }}
                />
            </SidebarMenuItem>
            <SidebarMenuItem>
                <SidebarMenuButton
                    className="bg-blue-600 p-2 rounded-md font-semibold font-poppins transition-shadow duration-500"
                    onClick={() => {
                        if (!navigator || !navigator.geolocation)
                            return alert("Geolocation not supported");

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
                            ).then((position) => {
                                onChange(
                                    position.coords.latitude,
                                    position.coords.longitude,
                                );
                            }),
                            {
                                pending: "Fetching location",
                                success: "Location fetched",
                                error: "Could not fetch location",
                            },
                            { autoClose: 500 },
                        );
                    }}
                >
                    Current
                </SidebarMenuButton>
            </SidebarMenuItem>
            {children}
        </>
    );
};
