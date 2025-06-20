import * as React from "react";

import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

const RawInput = React.forwardRef<
    HTMLInputElement,
    React.ComponentProps<"input">
>(({ className, type, ...props }, ref) => {
    return (
        <input
            type={type}
            className={cn(
                "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
                className,
            )}
            ref={ref}
            {...props}
        />
    );
});
RawInput.displayName = "RawInput";

type DebouncedInputProps = React.ComponentProps<"input"> & {
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    debounce?: number;
};

const Input = React.forwardRef<HTMLInputElement, DebouncedInputProps>(
    ({ onChange, debounce = 500, value, ...props }, ref) => {
        const [internalValue, setInternalValue] = React.useState(value ?? "");
        const debouncedValue = useDebounce(internalValue, debounce);

        React.useEffect(() => {
            if (debouncedValue !== value && onChange) {
                const event = {
                    ...({} as React.ChangeEvent<HTMLInputElement>),
                    target: { value: debouncedValue },
                };
                onChange(event as React.ChangeEvent<HTMLInputElement>);
            }
        }, [debouncedValue]);

        React.useEffect(() => {
            setInternalValue(value ?? "");
        }, [value]);

        return (
            <RawInput
                {...props}
                ref={ref}
                value={internalValue}
                onChange={(e) => setInternalValue(e.target.value)}
            />
        );
    },
);
Input.displayName = "Input";

export { Input, RawInput };
