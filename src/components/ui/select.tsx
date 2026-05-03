import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

type Options<T extends string> = Partial<Record<T, string>>;

const Select = <T extends string>({
    trigger,
    options,
    groups,
    value,
    onValueChange,
    disabled,
}: {
    disabled?: boolean;
    trigger: string | Record<"className" | "placeholder", string>;
    options?: Options<T>;
    groups?: Record<
        string,
        { disabled?: boolean; options: Options<T> } | Options<T>
    >;
    onValueChange?: (value: T) => void;
    value: T;
}) => {
    const { placeholder, className } =
        typeof trigger === "string" ? { placeholder: trigger, className: "" } : trigger;
    const [open, setOpen] = React.useState(false);
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const [triggerWidth, setTriggerWidth] = React.useState<number | undefined>(
        undefined,
    );

    React.useLayoutEffect(() => {
        if (open && triggerRef.current) {
            setTriggerWidth(triggerRef.current.offsetWidth);
        }
    }, [open]);

    const flatOptions: Options<T> = React.useMemo(() => {
        const merged: Options<T> = { ...(options ?? {}) };
        if (groups) {
            for (const v of Object.values(groups)) {
                const opts =
                    v && typeof v === "object" && "options" in v
                        ? v.options
                        : (v as Options<T>);
                Object.assign(merged, opts);
            }
        }
        return merged;
    }, [options, groups]);

    const displayValue = flatOptions[value];

    const handleSelect = (next: T) => {
        onValueChange?.(next);
        setOpen(false);
    };

    return (
        <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
            <PopoverPrimitive.Trigger
                ref={triggerRef}
                disabled={disabled}
                className={cn(
                    "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    className,
                )}
            >
                <span
                    className={cn(
                        "line-clamp-1 text-left",
                        !displayValue && "text-muted-foreground",
                    )}
                >
                    {displayValue ?? placeholder}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
            </PopoverPrimitive.Trigger>
                <PopoverPrimitive.Content
                    align="start"
                    sideOffset={4}
                    style={{
                        width: triggerWidth ? `${triggerWidth}px` : undefined,
                        minWidth: "8rem",
                    }}
                    className={cn(
                        "z-[1050] rounded-md border bg-popover text-popover-foreground shadow-md",
                        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
                    )}
                >
                    <div
                        className="p-1"
                        style={{
                            maxHeight: "24rem",
                            overflowY: "auto",
                            overscrollBehavior: "contain",
                            touchAction: "pan-y",
                            WebkitOverflowScrolling: "touch",
                        }}
                    >
                        {options &&
                            Object.entries(options).map(([k, label]) => (
                                <SelectItem
                                    key={k}
                                    selected={k === value}
                                    onSelect={() => handleSelect(k as T)}
                                >
                                    {label as string}
                                </SelectItem>
                            ))}
                        {groups &&
                            Object.entries(groups).map(([label, v]) => {
                                const opts =
                                    v && typeof v === "object" && "options" in v
                                        ? v.options
                                        : (v as Options<T>);
                                const groupDisabled =
                                    v &&
                                    typeof v === "object" &&
                                    "disabled" in v
                                        ? !!v.disabled
                                        : false;
                                return (
                                    <div key={label}>
                                        <div className="py-1.5 pl-8 pr-2 text-sm font-semibold">
                                            {label}
                                        </div>
                                        {Object.entries(opts).map(
                                            ([k, itemLabel]) => (
                                                <SelectItem
                                                    key={k}
                                                    selected={k === value}
                                                    disabled={groupDisabled}
                                                    onSelect={() =>
                                                        handleSelect(k as T)
                                                    }
                                                >
                                                    {itemLabel as string}
                                                </SelectItem>
                                            ),
                                        )}
                                    </div>
                                );
                            })}
                    </div>
                </PopoverPrimitive.Content>
        </PopoverPrimitive.Root>
    );
};

const SelectItem = ({
    selected,
    disabled,
    onSelect,
    children,
}: {
    selected?: boolean;
    disabled?: boolean;
    onSelect: () => void;
    children: React.ReactNode;
}) => {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onSelect}
            className={cn(
                "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none text-left hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50",
            )}
        >
            <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                {selected && <Check className="h-4 w-4" />}
            </span>
            <span className="line-clamp-1">{children}</span>
        </button>
    );
};

export { Select };
