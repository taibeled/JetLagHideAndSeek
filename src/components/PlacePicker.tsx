/**
 * Derivative of [@amraneze/osm-autocomplete](https://github.com/Amraneze/osm-autocomplete)
 */

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type KeyboardEvent,
} from "react";
import { useDebounce } from "../hooks/useDebounce";
import { cn } from "../utils/cn";
import {
    GEOCODER_API,
    geocode,
    type OpenStreetMap,
    determineName,
} from "../maps/api";
import { mapGeoLocation } from "../utils/context";
import { useStore } from "@nanostores/react";

export const PlacePicker = ({
    value = null,
    debounce = 500,
    placeholder = "Search",
    language = "en",
    className = "",
}: {
    value?: OpenStreetMap | null;
    debounce?: number;
    placeholder?: string;
    language?: string;
    className?: string;
}) => {
    const $mapGeoLocation = useStore(mapGeoLocation);

    const [isActive, setActive] = useState<boolean | number>(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [inputValue, setInputValue] = useState("");
    const debouncedValue = useDebounce<string>(inputValue, debounce);
    const [options, setOptions] = useState<OpenStreetMap[]>([]);
    const [selectedOption, setSelectedOption] = useState<OpenStreetMap | null>(
        null
    );

    const displayOptionsList = () => {
        if (isActive === -1) return setActive(false);
        setActive(true);
    };

    const hideOptionsList = () => {
        setActive(false);
    };

    // A workaround to act as onBlur, using onBlur will dismiss
    // the list before selecting an option
    useEffect(() => {
        function handleOnClickOutsideWrapper(event: MouseEvent) {
            if (!wrapperRef.current?.contains(event?.target as Node)) {
                hideOptionsList();
            }
        }
        document.addEventListener("click", handleOnClickOutsideWrapper, true);

        return () => {
            document.removeEventListener(
                "click",
                handleOnClickOutsideWrapper,
                true
            );
        };
    }, [wrapperRef]);

    useEffect(() => {
        if ($mapGeoLocation) {
            if (!value) value = $mapGeoLocation;

            if (inputRef.current) {
                setSelectedOption(value);
                setInputValue(value.properties.name);
                setActive(-1);
                inputRef.current.value = value.properties.name;
            }
        }
    }, [value]);

    const getGeocoding = useCallback(
        (address = "") => {
            if (!address) return;
            geocode(address, language)
                .then((data) => setOptions(data))
                .catch(() => setOptions([]));
        },
        [GEOCODER_API, language]
    );

    useEffect(() => {
        if (debouncedValue) {
            displayOptionsList();
            getGeocoding(debouncedValue);
        }
    }, [debouncedValue, getGeocoding]);

    const handleOnAutocomplete = (event: KeyboardEvent<HTMLInputElement>) => {
        setInputValue((event.target as HTMLInputElement).value);
    };

    const handleOnSearchClick = () => {
        if (inputRef.current) {
            displayOptionsList();
            setInputValue(inputRef.current.value);
        }
    };

    const handleOnSelectOption = (option: OpenStreetMap) => {
        setSelectedOption(option);
        if (inputRef.current) {
            inputRef.current.value = option.properties.name;
        }

        mapGeoLocation.set(option);

        hideOptionsList();
    };

    return (
        <div
            ref={wrapperRef}
            className={cn("flex w-[20rem] text-slate-800 flex-col", className)}
        >
            <div
                className={cn(
                    "flex rounded-t-md rounded-b-md items-center bg-white px-1 py-2 transition-all shadow-md",
                    isActive === true && "rounded-b-none"
                )}
            >
                <div className="flex-1 cursor-text text-sm font-normal ml-2">
                    <input
                        type="text"
                        ref={inputRef}
                        placeholder={placeholder}
                        onClick={displayOptionsList}
                        onKeyUp={handleOnAutocomplete}
                        className="border-none w-full py-1 focus:outline-none"
                    />
                </div>
                <button
                    tabIndex={0}
                    type="button"
                    onClick={handleOnSearchClick}
                    className="border-none cursor-pointer p-2 text-lg rounded-full inline-flex bg-transparent transition-all hover:bg-slate-200 focus:outline-none"
                >
                    <svg className="w-[1em] h-[1em] fill-current">
                        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                    </svg>
                </button>
            </div>
            <div
                className={cn(
                    "max-h-0 rounded-b-md bg-white shadow-md transition-all",
                    isActive === true && "max-h-[16em]"
                )}
            >
                <ul
                    role="menu"
                    className="m-0 overflow-auto list-none max-h-[16em] px-2"
                >
                    {options.map((option) => (
                        <li
                            role="menuitem"
                            key={option.properties.osm_id}
                            onClick={() => handleOnSelectOption(option)}
                            onKeyDown={() => handleOnSelectOption(option)}
                            className={cn(
                                "cursor-pointer overflow-hidden px-1 py-2 hidden hover:bg-slate-200",
                                option.properties.osm_id ===
                                    selectedOption?.properties.osm_id &&
                                    "bg-slate-300 hover:bg-slate-400",
                                isActive === true && "block"
                            )}
                        >
                            {determineName(option)}
                        </li>
                    ))}
                    {options.length === 0 && (
                        <li className="py-2">No results</li>
                    )}
                </ul>
            </div>
        </div>
    );
};
