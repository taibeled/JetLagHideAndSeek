import { mapGeoJSON, polyGeoJSON, questions } from "@/utils/context";
import { Button } from "./ui/button";
import { toast } from "react-toastify";

export const Options = () => {
    return (
        <div className="flex flex-col items-center mt-6 gap-2">
            <h2 className="text-4xl font-semibold font-poppins mb-2">Options</h2>
            <div className="flex flex-row gap-4">
                <Button onClick={() => {
                    if (!navigator || !navigator.clipboard)
                        return toast.error("Clipboard not supported");

                    navigator.clipboard.writeText(JSON.stringify(mapGeoJSON.get()));
                    toast.success("Hiding zone copied successfully", {
                        autoClose: 2000,
                    });
                }}>
                    Copy Hiding Zone
                </Button>
                <Button onClick={() => {
                    if (!navigator || !navigator.clipboard)
                        return toast.error("Clipboard not supported");

                    navigator.clipboard.readText().then((text) => {
                        try {
                            const geojson = JSON.parse(text);
                            mapGeoJSON.set(geojson);
                            polyGeoJSON.set(geojson);
                            questions.set([]);
                            toast.success("Hiding zone pasted successfully", {
                                autoClose: 2000,
                            });
                        } catch (e) {
                            toast.error("Invalid GeoJSON");
                        }
                    });
                }}>
                    Paste Hiding Zone
                </Button>
            </div>
        </div>
    );
};
