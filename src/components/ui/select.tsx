import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

type Options<T extends string> = Partial<Record<T, string>>;

const AUTO_SCROLL_INTERVAL_MS = 50;
const FALLBACK_SCROLL_STEP_PX = 32;

// Hover-capable pointer = desktop/laptop. Touch devices scroll natively and
// cannot hover, so the scroll arrows are pointless there.
const useCanHover = () => {
    const [canHover, setCanHover] = React.useState(false);

    React.useEffect(() => {
        const mql = window.matchMedia("(hover: hover) and (pointer: fine)");
        const onChange = () => setCanHover(mql.matches);
        mql.addEventListener("change", onChange);
        setCanHover(mql.matches);
        return () => mql.removeEventListener("change", onChange);
    }, []);

    return canHover;
};

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
        typeof trigger === "string"
            ? { placeholder: trigger, className: "" }
            : trigger;
    const [open, setOpen] = React.useState(false);
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const [triggerWidth, setTriggerWidth] = React.useState<number | undefined>(
        undefined,
    );

    const canHover = useCanHover();
    const viewportRef = React.useRef<HTMLDivElement | null>(null);
    const autoScrollTimerRef = React.useRef<number | null>(null);
    const [canScrollUp, setCanScrollUp] = React.useState(false);
    const [canScrollDown, setCanScrollDown] = React.useState(false);

    React.useLayoutEffect(() => {
        if (open && triggerRef.current) {
            setTriggerWidth(triggerRef.current.offsetWidth);
        }
    }, [open]);

    const updateScrollButtons = React.useCallback(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        setCanScrollUp(viewport.scrollTop > 0);
        setCanScrollDown(
            viewport.scrollTop + viewport.clientHeight <
                viewport.scrollHeight - 1,
        );
    }, []);

    const viewportRefCallback = React.useCallback(
        (node: HTMLDivElement | null) => {
            viewportRef.current = node;
            if (node) updateScrollButtons();
        },
        [updateScrollButtons],
    );

    const stopAutoScroll = React.useCallback(() => {
        if (autoScrollTimerRef.current !== null) {
            window.clearInterval(autoScrollTimerRef.current);
            autoScrollTimerRef.current = null;
        }
    }, []);

    // Mirrors Radix Select's scroll buttons: while hovered, scroll by one
    // item height every 50ms. Stops at the edge, since the button then
    // unmounts and no pointerleave is fired.
    const startAutoScroll = React.useCallback(
        (direction: -1 | 1) => {
            if (autoScrollTimerRef.current !== null) return;
            autoScrollTimerRef.current = window.setInterval(() => {
                const viewport = viewportRef.current;
                if (!viewport) {
                    stopAutoScroll();
                    return;
                }
                const step =
                    viewport.querySelector("button")?.offsetHeight ||
                    FALLBACK_SCROLL_STEP_PX;
                const previous = viewport.scrollTop;
                viewport.scrollTop = previous + direction * step;
                if (viewport.scrollTop === previous) stopAutoScroll();
            }, AUTO_SCROLL_INTERVAL_MS);
        },
        [stopAutoScroll],
    );

    React.useEffect(() => {
        if (!open) stopAutoScroll();
        return stopAutoScroll;
    }, [open, stopAutoScroll]);

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
                    maxHeight: "24rem",
                }}
                className={cn(
                    "z-[1050] flex flex-col rounded-md border bg-popover text-popover-foreground shadow-md",
                    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                    "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
                )}
            >
                {canHover && canScrollUp && (
                    <SelectScrollButton
                        direction="up"
                        onAutoScrollStart={() => startAutoScroll(-1)}
                        onAutoScrollStop={stopAutoScroll}
                    />
                )}
                <div
                    ref={viewportRefCallback}
                    onScroll={canHover ? updateScrollButtons : undefined}
                    className="p-1"
                    style={{
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
                                v && typeof v === "object" && "disabled" in v
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
                {canHover && canScrollDown && (
                    <SelectScrollButton
                        direction="down"
                        onAutoScrollStart={() => startAutoScroll(1)}
                        onAutoScrollStop={stopAutoScroll}
                    />
                )}
            </PopoverPrimitive.Content>
        </PopoverPrimitive.Root>
    );
};

const SelectScrollButton = ({
    direction,
    onAutoScrollStart,
    onAutoScrollStop,
}: {
    direction: "up" | "down";
    onAutoScrollStart: () => void;
    onAutoScrollStop: () => void;
}) => {
    const Chevron = direction === "up" ? ChevronUp : ChevronDown;
    return (
        <div
            aria-hidden="true"
            className="flex shrink-0 cursor-default items-center justify-center py-1"
            onPointerDown={onAutoScrollStart}
            onPointerMove={onAutoScrollStart}
            onPointerLeave={onAutoScrollStop}
        >
            <Chevron className="h-4 w-4" />
        </div>
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
