import {
    defaultUnit,
    mapGeoJSON,
    mapGeoLocation,
    polyGeoJSON,
    questions,
} from "@/utils/context";
import { Button } from "./ui/button";
import { toast } from "react-toastify";
import { Label } from "./ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/select";
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import { Separator } from "./ui/separator";
import { useStore } from "@nanostores/react";
import { cn } from "@/lib/utils";

export const Options = ({ className }: { className?: string }) => {
    const $defaultUnit = useStore(defaultUnit);

    return (
        <Drawer>
            <div className={cn("flex justify-center", className)}>
                <DrawerTrigger className="w-24">
                    <Button className="w-24">Options</Button>
                </DrawerTrigger>
            </div>
            <DrawerContent>
                <div className="flex flex-col items-center gap-4 mb-4">
                    <DrawerHeader>
                        <DrawerTitle className="text-4xl font-semibold font-poppins">
                            Options
                        </DrawerTitle>
                    </DrawerHeader>
                    <div className="flex flex-row gap-4">
                        <Button
                            onClick={() => {
                                if (!navigator || !navigator.clipboard)
                                    return toast.error(
                                        "Clipboard not supported",
                                    );

                                const $polyGeoJSON = polyGeoJSON.get();
                                if ($polyGeoJSON !== null) {
                                    navigator.clipboard.writeText(
                                        JSON.stringify($polyGeoJSON),
                                    );
                                } else {
                                    const location = mapGeoLocation.get();
                                    location.properties.isHidingZone = true;

                                    navigator.clipboard.writeText(
                                        JSON.stringify(location),
                                    );
                                }
                                toast.success(
                                    "Hiding zone copied successfully",
                                    {
                                        autoClose: 2000,
                                    },
                                );
                            }}
                        >
                            Copy Hiding Zone
                        </Button>
                        <Button
                            onClick={() => {
                                if (!navigator || !navigator.clipboard)
                                    return toast.error(
                                        "Clipboard not supported",
                                    );

                                navigator.clipboard.readText().then((text) => {
                                    try {
                                        const geojson = JSON.parse(text);

                                        if (
                                            geojson.properties &&
                                            geojson.properties.isHidingZone ===
                                                true
                                        ) {
                                            mapGeoLocation.set(geojson);
                                            mapGeoJSON.set(null);
                                            polyGeoJSON.set(null);
                                            questions.set([]);
                                        } else {
                                            mapGeoJSON.set(geojson);
                                            polyGeoJSON.set(geojson);
                                            questions.set([]);
                                        }

                                        toast.success(
                                            "Hiding zone pasted successfully",
                                            {
                                                autoClose: 2000,
                                            },
                                        );
                                    } catch {
                                        toast.error("Invalid GeoJSON");
                                    }
                                });
                            }}
                        >
                            Paste Hiding Zone
                        </Button>
                    </div>
                    <Separator className="bg-slate-300 w-[280px]" />
                    <Label>Default Unit</Label>
                    <Select
                        value={$defaultUnit}
                        onValueChange={defaultUnit.set}
                    >
                        <SelectTrigger className="w-[250px]">
                            <SelectValue placeholder="Select a unit" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="meters">Meters</SelectItem>
                            <SelectItem value="kilometers">
                                Kilometers
                            </SelectItem>
                            <SelectItem value="miles">Miles</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </DrawerContent>
        </Drawer>
    );
};
