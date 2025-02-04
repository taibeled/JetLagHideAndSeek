import {
    defaultUnit,
    highlightTrainLines,
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
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import { Separator } from "./ui/separator";
import { useStore } from "@nanostores/react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Checkbox } from "./ui/checkbox";

export const OptionDrawers = ({ className }: { className?: string }) => {
    const $defaultUnit = useStore(defaultUnit);
    const $highlightTrainLines = useStore(highlightTrainLines);
    const [isInstructionsOpen, setInstructionsOpen] = useState(false);
    const [isOptionsOpen, setOptionsOpen] = useState(false);

    return (
        <div
            className={cn(
                "flex justify-end gap-2 max-[412px]:!mb-4",
                className,
            )}
        >
            <Drawer
                open={isInstructionsOpen}
                onOpenChange={setInstructionsOpen}
            >
                <DrawerTrigger className="w-24">
                    <Button className="w-24">Instructions</Button>
                </DrawerTrigger>
                <DrawerContent>
                    <div className="flex flex-col items-center gap-4 mb-1">
                        <DrawerHeader>
                            <DrawerTitle className="text-4xl font-semibold font-poppins">
                                Instructions
                            </DrawerTitle>
                        </DrawerHeader>
                        <div className="px-12 pb-2 max-w-[1000px] text-center overflow-y-scroll max-h-[40vh] font-oxygen">
                            <DrawerDescription className="mb-2">
                                Map Generator for Jet Lag The Game: Hide and
                                Seek is intended for those who have purchased
                                the Jet Lag Home Game. However, it is not
                                affiliated with them in any way.
                            </DrawerDescription>
                            <p className="mb-3">
                                At the beginning of the game, all players should
                                coordinate the hiding zone. You can choose a
                                location at the top of the map (e.g. city,
                                county, state, country...) or draw it on the map
                                (look at the bottom left of the map). This can
                                be easily shared through the{" "}
                                <a
                                    onClick={() => {
                                        setOptionsOpen(true);
                                        setInstructionsOpen(false);
                                    }}
                                    className="text-blue-500 cursor-pointer"
                                >
                                    options menu
                                </a>{" "}
                                at the bottom right of the screen. You may want
                                to change the default unit from miles in that
                                menu. You can also choose to highlight train
                                lines on the map in that menu.
                            </p>
                            <p className="mb-3">
                                Whenever a question is asked, you should add it
                                to the map immediately. This can be done most
                                trivially by right clicking on the map in
                                desktop or long pressing on the map in mobile.
                                Choose the question from the dropdown and a
                                marker will appear where you clicked. Move that
                                to the location where you asked the question.
                                Alternatively you could click the marker and
                                click the &ldquo;Current&rdquo; button for the
                                marker to be moved to your physical location.
                                You can also add a question through the question
                                sidebar (left side of the screen, open it on the
                                top left). The sidebar will display all the
                                questions in an organized manner instead of
                                requiring a click on each marker to see each
                                question.
                            </p>
                        </div>
                    </div>
                </DrawerContent>
            </Drawer>
            <Drawer open={isOptionsOpen} onOpenChange={setOptionsOpen}>
                <DrawerTrigger className="w-24">
                    <Button className="w-24">Options</Button>
                </DrawerTrigger>
                <DrawerContent>
                    <div className="flex flex-col items-center gap-4 mb-4">
                        <DrawerHeader>
                            <DrawerTitle className="text-4xl font-semibold font-poppins">
                                Options
                            </DrawerTitle>
                        </DrawerHeader>
                        <div className="flex flex-row max-[330px]:flex-col gap-4">
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

                                    navigator.clipboard
                                        .readText()
                                        .then((text) => {
                                            try {
                                                const geojson =
                                                    JSON.parse(text);

                                                if (
                                                    geojson.properties &&
                                                    geojson.properties
                                                        .isHidingZone === true
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
                        <Separator className="bg-slate-300 w-[280px]" />
                        <div className="flex flex-row items-center gap-2">
                            <label className="text-2xl font-semibold font-poppins">
                                Highlight train lines?
                            </label>
                            <Checkbox
                                checked={$highlightTrainLines}
                                onCheckedChange={() => {
                                    highlightTrainLines.set(
                                        !$highlightTrainLines,
                                    );
                                }}
                            />
                        </div>
                    </div>
                </DrawerContent>
            </Drawer>
        </div>
    );
};
