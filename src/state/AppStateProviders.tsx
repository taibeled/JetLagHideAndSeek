import type { ReactNode } from "react";

import { HidingZoneProvider } from "@/state/hidingZoneStore";
import { PlayAreaProvider } from "@/state/playAreaStore";

export function AppStateProviders({ children }: { children: ReactNode }) {
    return (
        <PlayAreaProvider>
            <HidingZoneProvider>{children}</HidingZoneProvider>
        </PlayAreaProvider>
    );
}
