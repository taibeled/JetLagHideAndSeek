import { toast } from "react-toastify";
import { cn } from "../utils/cn";

export const LatitudeLongitude = ({
    latitude,
    longitude,
    onChange,
    latLabel = "Latitude",
    lngLabel = "Longitude",
    children,
    className = "",
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
        <div
            className={cn(
                "flex flex-col items-center gap-3 md:items-end md:flex-row",
                className
            )}
        >
            <div className="flex flex-col gap-2 ml-4">
                <label className="text-white text-3xl italic font-semibold font-poppins">
                    {latLabel}
                </label>
                <input
                    type="number"
                    className="rounded-md p-2 text-slate-900"
                    value={latitude}
                    onChange={(e) => {
                        onChange(parseFloat(e.target.value), null);
                    }}
                />
            </div>
            <div className="flex flex-col gap-2 ml-4">
                <label className="text-white text-3xl italic font-semibold font-poppins">
                    {lngLabel}
                </label>
                <input
                    type="number"
                    className="rounded-md p-2 text-slate-900"
                    value={longitude}
                    onChange={(e) => {
                        onChange(null, parseFloat(e.target.value));
                    }}
                />
            </div>
            <div className="flex items-end flex-grow ml-3">
                <button
                    className="bg-blue-600 p-2 rounded-md hover:shadow-blue-300 hover:shadow-md focus:shadow-blue-400 focus:shadow-inner font-semibold font-poppins transition-shadow duration-500"
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
                                        }
                                    );
                                }
                            ).then((position) => {
                                onChange(
                                    position.coords.latitude,
                                    position.coords.longitude
                                );
                            }),
                            {
                                pending: "Fetching location",
                                success: "Location fetched",
                                error: "Could not fetch location",
                            },
                            { autoClose: 500 }
                        );
                    }}
                >
                    Current
                </button>
            </div>
            {children}
        </div>
    );
};