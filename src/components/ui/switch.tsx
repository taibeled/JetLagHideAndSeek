import * as React from "react";
import { cn } from "@/lib/utils";

interface SwitchProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
    ({ checked, onCheckedChange, disabled = false, className }, ref) => (
        <button
            ref={ref}
            role="switch"
            type="button"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onCheckedChange(!checked)}
            className={cn(
                "relative inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                className,
            )}
            style={{
                background: checked ? "var(--color-primary)" : "#4A5568",
            }}
        >
            <span
                className="pointer-events-none block h-[20px] w-[20px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out"
                style={{
                    transform: checked ? "translateX(22px)" : "translateX(3px)",
                    marginTop: 3,
                }}
            />
        </button>
    ),
);
Switch.displayName = "Switch";

export { Switch };
