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
import { Separator } from "./ui/separator";

export const Options = () => {
    return (
        <div className="flex flex-col items-center mt-6 gap-4">
            <h2 className="text-4xl font-semibold font-poppins">Options</h2>
            <div className="flex flex-row gap-4">
                <Button
                    onClick={() => {
                        if (!navigator || !navigator.clipboard)
                            return toast.error("Clipboard not supported");

                        let $polyGeoJSON = polyGeoJSON.get();
                        if ($polyGeoJSON !== null) {
                            navigator.clipboard.writeText(
                                JSON.stringify($polyGeoJSON)
                            );
                        } else {
                            const location = mapGeoLocation.get();
                            location.properties.isHidingZone = true;

                            navigator.clipboard.writeText(
                                JSON.stringify(location)
                            );
                        }
                        toast.success("Hiding zone copied successfully", {
                            autoClose: 2000,
                        });
                    }}
                >
                    Copy Hiding Zone
                </Button>
                <Button
                    onClick={() => {
                        if (!navigator || !navigator.clipboard)
                            return toast.error("Clipboard not supported");

                        navigator.clipboard.readText().then((text) => {
                            try {
                                const geojson = JSON.parse(text);

                                if (
                                    geojson.properties &&
                                    geojson.properties.isHidingZone === true
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
                                    }
                                );
                            } catch (e) {
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
                defaultValue={defaultUnit.get()}
                onValueChange={defaultUnit.set}
            >
                <SelectTrigger className="w-[250px]">
                    <SelectValue placeholder="Select a unit" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="meters">Meters</SelectItem>
                    <SelectItem value="kilometers">Kilometers</SelectItem>
                    <SelectItem value="miles">Miles</SelectItem>
                </SelectContent>
            </Select>
        </div>
    );
};
