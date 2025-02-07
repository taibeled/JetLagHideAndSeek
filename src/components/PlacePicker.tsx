import { useEffect, useState } from "react";
import { useDebounce } from "../hooks/useDebounce";
import { cn } from "../lib/utils";
import { geocode, type OpenStreetMap, determineName } from "../maps/api";
import {
    mapGeoJSON,
    mapGeoLocation,
    polyGeoJSON,
    questions,
} from "../utils/context";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useStore } from "@nanostores/react";
import { Button } from "./ui/button";
import { ChevronsUpDown } from "lucide-react";

export const PlacePicker = ({
    className = "",
}: {
    value?: OpenStreetMap | null;
    debounce?: number;
    placeholder?: string;
    language?: string;
    className?: string;
}) => {
    const $mapGeoLocation = useStore(mapGeoLocation);
    const $polyGeoJSON = useStore(polyGeoJSON);
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const debouncedValue = useDebounce<string>(inputValue);
    const [results, setResults] = useState<OpenStreetMap[]>([]);

    useEffect(() => {
        if (debouncedValue === "") {
            setResults([]);
            return;
        } else {
            geocode(debouncedValue, "en")
                .then((x) => {
                    setResults(x);
                })
                .catch((e) => {
                    console.log(e);
                    setResults([]);
                });
        }
    }, [debouncedValue]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "w-[300px] justify-between light text-slate-700",
                        className,
                    )}
                >
                    {$polyGeoJSON
                        ? "Polygon selected"
                        : $mapGeoLocation &&
                            $mapGeoLocation.properties &&
                            $mapGeoLocation.properties.name
                          ? determineName($mapGeoLocation)
                          : "Hiding bounds"}
                    <ChevronsUpDown className="opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0 light">
                <Command>
                    <CommandInput
                        placeholder="Search place..."
                        onKeyUp={(x) => {
                            setInputValue(x.currentTarget.value);
                        }}
                    />
                    <CommandList>
                        <CommandEmpty>No locations found.</CommandEmpty>
                        <CommandGroup>
                            {results.map((result) => (
                                <CommandItem
                                    key={`${result.properties.osm_id}${result.properties.name}`}
                                    onSelect={() => {
                                        mapGeoLocation.set(result);
                                        mapGeoJSON.set(null);
                                        polyGeoJSON.set(null);
                                        questions.set([]);
                                    }}
                                    className="cursor-pointer"
                                >
                                    {determineName(result)}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
};
