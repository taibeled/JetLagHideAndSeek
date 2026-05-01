"use client";

import * as React from "react";

/** Mount point for Radix Select portals so menus stay inside the dialog content subtree (required for react-remove-scroll shard matching on mobile Sheet sidebars). */
export const SelectPortalContainerContext =
    React.createContext<HTMLElement | null>(null);

export function SelectPortalHost({ children }: { children: React.ReactNode }) {
    const [container, setContainer] = React.useState<HTMLElement | null>(null);
    return (
        <SelectPortalContainerContext.Provider value={container}>
            {children}
            <div
                ref={setContainer}
                className="h-0 w-full shrink-0 overflow-visible"
                aria-hidden
            />
        </SelectPortalContainerContext.Provider>
    );
}
