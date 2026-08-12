import { useStore } from "@nanostores/react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { WritableAtom } from "nanostores";
import * as React from "react";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { SidebarContextType } from "@/components/ui/sidebar-context";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const SIDEBAR_COOKIE_NAME = "sidebar:state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

export const MENU_ITEM_CLASSNAME =
    "flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0";

/**
 * Each side passes its own atom, so `useStore` stays bound to that instance.
 */
type SidebarContextStore = WritableAtom<SidebarContextType>;

/** Lets the left sidebar rewrite the visual state while the tutorial runs. */
type UseDisplayState = (displayState: {
    state: SidebarContextType["state"];
    openMobile: boolean;
}) => { state: SidebarContextType["state"]; openMobile: boolean };

const identityDisplayState: UseDisplayState = (displayState) => displayState;

/**
 * Builds the sidebar components that need a context atom. Call this once per
 * sidebar at module scope so the component identities stay stable.
 */
export const createSidebarComponents = (
    SidebarContext: SidebarContextStore,
    {
        triggerIcon,
        useDisplayState = identityDisplayState,
    }: {
        triggerIcon: React.ReactNode;
        useDisplayState?: UseDisplayState;
    },
) => {
    const SidebarProvider = React.forwardRef<
        HTMLDivElement,
        React.ComponentProps<"div"> & {
            defaultOpen?: boolean;
            open?: boolean;
            onOpenChange?: (open: boolean) => void;
        }
    >(
        (
            {
                defaultOpen = true,
                open: openProp,
                onOpenChange: setOpenProp,
                className,
                style,
                children,
                ...props
            },
            ref,
        ) => {
            const isMobile = useIsMobile();
            const [openMobile, setOpenMobile] = React.useState(false);

            // This is the internal state of the sidebar.
            // We use openProp and setOpenProp for control from outside the component.
            const [_open, _setOpen] = React.useState(defaultOpen);
            const open = openProp ?? _open;
            const setOpen = React.useCallback(
                (value: boolean | ((value: boolean) => boolean)) => {
                    const openState =
                        typeof value === "function" ? value(open) : value;
                    if (setOpenProp) {
                        setOpenProp(openState);
                    } else {
                        _setOpen(openState);
                    }

                    // This sets the cookie to keep the sidebar state.
                    document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
                },
                [setOpenProp, open],
            );

            // Helper to toggle the sidebar.
            const toggleSidebar = React.useCallback(() => {
                return isMobile
                    ? setOpenMobile((open) => !open)
                    : setOpen((open) => !open);
            }, [isMobile, setOpen, setOpenMobile]);

            // Adds a keyboard shortcut to toggle the sidebar.
            React.useEffect(() => {
                const handleKeyDown = (event: KeyboardEvent) => {
                    if (
                        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
                        (event.metaKey || event.ctrlKey)
                    ) {
                        event.preventDefault();
                        toggleSidebar();
                    }
                };

                window.addEventListener("keydown", handleKeyDown);
                return () =>
                    window.removeEventListener("keydown", handleKeyDown);
            }, [toggleSidebar]);

            // We add a state so that we can do data-state="expanded" or "collapsed".
            // This makes it easier to style the sidebar with Tailwind classes.
            const state = open ? "expanded" : "collapsed";

            React.useEffect(() => {
                SidebarContext.set({
                    state,
                    open,
                    setOpen,
                    isMobile,
                    openMobile,
                    setOpenMobile,
                    toggleSidebar,
                });
            }, [
                state,
                open,
                setOpen,
                isMobile,
                openMobile,
                setOpenMobile,
                toggleSidebar,
            ]);

            return (
                <TooltipProvider delayDuration={0}>
                    <div
                        data-mobile-sheet-open={openMobile ? "true" : "false"}
                        style={
                            {
                                "--sidebar-width": SIDEBAR_WIDTH,
                                "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
                                ...style,
                            } as React.CSSProperties
                        }
                        className={cn(
                            "group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar",
                            className,
                        )}
                        ref={ref}
                        {...props}
                    >
                        {children}
                    </div>
                </TooltipProvider>
            );
        },
    );
    SidebarProvider.displayName = "SidebarProvider";

    const Sidebar = React.forwardRef<
        HTMLDivElement,
        React.ComponentProps<"div"> & {
            side?: "left" | "right";
            variant?: "sidebar" | "floating" | "inset";
            collapsible?: "offcanvas" | "icon" | "none";
        }
    >(
        (
            {
                side = "left",
                variant = "sidebar",
                collapsible = "offcanvas",
                className,
                children,
                ...props
            },
            ref,
        ) => {
            const contextValue = useStore(SidebarContext);
            const { isMobile, setOpenMobile } = contextValue;
            const { state, openMobile } = useDisplayState({
                state: contextValue.state,
                openMobile: contextValue.openMobile,
            });

            if (collapsible === "none") {
                return (
                    <div
                        className={cn(
                            "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
                            className,
                        )}
                        ref={ref}
                        {...props}
                    >
                        {children}
                    </div>
                );
            }

            if (isMobile) {
                return (
                    <Sheet
                        open={openMobile}
                        onOpenChange={setOpenMobile}
                        {...props}
                    >
                        <SheetContent
                            data-sidebar="sidebar"
                            data-mobile="true"
                            className="w-full bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden z-1035"
                            style={
                                {
                                    "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
                                } as React.CSSProperties
                            }
                            side={side}
                        >
                            <div className="flex h-full w-full flex-col">
                                {children}
                            </div>
                        </SheetContent>
                    </Sheet>
                );
            }

            return (
                <div
                    ref={ref}
                    className="group peer hidden md:block text-sidebar-foreground"
                    data-state={state}
                    data-collapsible={state === "collapsed" ? collapsible : ""}
                    data-variant={variant}
                    data-side={side}
                >
                    {/* This is what handles the sidebar gap on desktop */}
                    <div
                        className={cn(
                            "duration-200 relative h-svh w-(--sidebar-width) bg-transparent transition-[width] ease-linear",
                            "group-data-[collapsible=offcanvas]:w-0",
                            "group-data-[side=right]:rotate-180",
                            variant === "floating" || variant === "inset"
                                ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
                                : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
                        )}
                    />
                    <div
                        className={cn(
                            "duration-200 fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] ease-linear md:flex",
                            side === "left"
                                ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
                                : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
                            // Adjust the padding for floating and inset variants.
                            variant === "floating" || variant === "inset"
                                ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
                                : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
                            className,
                        )}
                        {...props}
                    >
                        <div
                            data-sidebar="sidebar"
                            className="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow-sm"
                        >
                            {children}
                        </div>
                    </div>
                </div>
            );
        },
    );
    Sidebar.displayName = "Sidebar";

    const SidebarTrigger = React.forwardRef<
        HTMLButtonElement,
        React.ComponentProps<"button">
    >(({ className, onClick, ...props }, ref) => {
        const { toggleSidebar } = useStore(SidebarContext);

        return (
            <button
                ref={ref}
                data-sidebar="trigger"
                className={cn(
                    "bg-white hover:bg-[#f4f4f4] text-black rounded-sm border-2 border-black/30 cursor-pointer py-1 px-2",
                    "flex items-center gap-1",
                    className,
                )}
                onClick={(event) => {
                    onClick?.(event);
                    toggleSidebar();
                }}
                {...props}
            >
                {triggerIcon}
            </button>
        );
    });
    SidebarTrigger.displayName = "SidebarTrigger";

    const SidebarMenuButton = React.forwardRef<
        HTMLButtonElement,
        React.ComponentProps<"button"> & {
            asChild?: boolean;
            isActive?: boolean;
            tooltip?: string | React.ComponentProps<typeof TooltipContent>;
        } & VariantProps<typeof sidebarMenuButtonVariants>
    >(
        (
            {
                asChild = false,
                isActive = false,
                variant = "default",
                size = "default",
                tooltip,
                className,
                ...props
            },
            ref,
        ) => {
            const Comp = asChild ? Slot : "button";
            const { isMobile, state } = useStore(SidebarContext);

            const button = (
                <Comp
                    ref={ref}
                    data-sidebar="menu-button"
                    data-size={size}
                    data-active={isActive}
                    className={cn(
                        sidebarMenuButtonVariants({ variant, size }),
                        className,
                    )}
                    {...props}
                />
            );

            if (!tooltip) {
                return button;
            }

            if (typeof tooltip === "string") {
                tooltip = {
                    children: tooltip,
                };
            }

            return (
                <Tooltip>
                    <TooltipTrigger asChild>{button}</TooltipTrigger>
                    <TooltipContent
                        side="right"
                        align="center"
                        hidden={state !== "collapsed" || isMobile}
                        {...tooltip}
                    />
                </Tooltip>
            );
        },
    );
    SidebarMenuButton.displayName = "SidebarMenuButton";

    return { Sidebar, SidebarMenuButton, SidebarProvider, SidebarTrigger };
};

export const SidebarContent = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
    return (
        <div
            ref={ref}
            data-sidebar="content"
            className={cn(
                "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
                className,
            )}
            {...props}
        />
    );
});
SidebarContent.displayName = "SidebarContent";

export const SidebarGroup = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
    return (
        <div
            ref={ref}
            data-sidebar="group"
            className={cn(
                "relative flex w-full min-w-0 flex-col p-2",
                className,
            )}
            {...props}
        />
    );
});
SidebarGroup.displayName = "SidebarGroup";

export const SidebarGroupLabel = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<"div"> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";

    return (
        <Comp
            ref={ref}
            data-sidebar="group-label"
            className={cn(
                "duration-200 flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-hidden ring-sidebar-ring transition-[margin,opa] ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
                "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
                className,
            )}
            {...props}
        />
    );
});
SidebarGroupLabel.displayName = "SidebarGroupLabel";

export const SidebarGroupContent = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        data-sidebar="group-content"
        className={cn("w-full text-sm", className)}
        {...props}
    />
));
SidebarGroupContent.displayName = "SidebarGroupContent";

export const SidebarMenu = React.forwardRef<
    HTMLUListElement,
    React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
    <ul
        ref={ref}
        data-sidebar="menu"
        className={cn("flex w-full min-w-0 flex-col gap-1", className)}
        {...props}
    />
));
SidebarMenu.displayName = "SidebarMenu";

export const SidebarMenuItem = React.forwardRef<
    HTMLLIElement,
    React.ComponentProps<"li"> & {
        disabled?: boolean;
    }
>(({ className, disabled, onClick, ...props }, ref) => (
    <li
        ref={ref}
        data-sidebar="menu-item"
        className={cn(
            "group/menu-item relative",
            disabled && "pointer-events-none opacity-50",
            className,
        )}
        onClick={disabled ? undefined : onClick}
        {...props}
    />
));
SidebarMenuItem.displayName = "SidebarMenuItem";

const sidebarMenuButtonVariants = cva(
    "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
    {
        variants: {
            variant: {
                default:
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                outline:
                    "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]",
            },
            size: {
                default: "h-8 text-sm",
                sm: "h-7 text-xs",
                lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    },
);
