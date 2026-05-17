import rawPresetData from "../../../data/odpt/generated/hiding-zone-presets.json";

import type { HidingZonePreset } from "./hidingZoneTypes";

type RawPresetData = {
    presets: HidingZonePreset[];
};

export const hidingZonePresets = (rawPresetData as unknown as RawPresetData)
    .presets;
