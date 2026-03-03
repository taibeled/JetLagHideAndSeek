"use client";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { PlacePicker } from "@/components/PlacePicker";
import { additionalMapGeoLocations, mapGeoLocation } from "@/lib/context";
import { hiderAreaConfirmed, pendingRole } from "@/lib/session-context";

export function HiderAreaSearch({ onBack }: { onBack?: () => void } = {}) {
    const tr = useT();

    function handleConfirm() {
        // PlacePicker adds selections to additionalMapGeoLocations, not mapGeoLocation.
        // We may need to promote the first added zone to the primary location so that
        // buildMapLocationFromContext / determineMapBoundaries has a real zone as primary.
        //
        // BUT: only do this when mapGeoLocation is still the Germany default (osm_id 51477).
        // If the user removed Germany via the X button in PlacePicker, the first added
        // zone was already auto-promoted to mapGeoLocation by PlacePicker itself.
        // In that case, promoting again would discard the correct primary and lose it.
        const GERMANY_DEFAULT_OSM_ID = 51477;
        const currentOsmId = (mapGeoLocation.get() as any)?.properties?.osm_id;

        if (currentOsmId === GERMANY_DEFAULT_OSM_ID) {
            const additional = additionalMapGeoLocations.get();
            const firstAdded = additional.find((x) => x.added);
            if (firstAdded) {
                mapGeoLocation.set(firstAdded.location);
                additionalMapGeoLocations.set(additional.filter((x) => x !== firstAdded));
            }
        }
        hiderAreaConfirmed.set(true);
    }

    return (
        <div className="flex flex-col gap-3 py-2">
            <p className="text-sm font-semibold">{tr("area.title")}</p>
            <p className="text-xs text-muted-foreground">{tr("area.hint")}</p>
            <PlacePicker className="w-full" />
            <Button
                className="w-full"
                onClick={handleConfirm}
            >
                {tr("area.confirm")}
            </Button>
            <button
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                onClick={() => onBack ? onBack() : pendingRole.set(null)}
            >
                {tr("area.back")}
            </button>
        </div>
    );
}
