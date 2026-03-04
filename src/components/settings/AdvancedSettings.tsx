import { useStore } from "@nanostores/react";
import { useT } from "@/i18n";
import {
    alwaysUsePastebin,
    animateMapMovements,
    autoSave,
    customInitPreference,
    followMe,
    hiderMode,
    highlightTrainLines,
    leafletMapContext,
    pastebinApiKey,
    planningModeEnabled,
    questions,
    save,
    thunderforestApiKey,
    triggerLocalRefresh,
} from "@/lib/context";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LatitudeLongitude } from "@/components/LatLngPicker";
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";

import { SettingsRow } from "./SettingsRow";

interface AdvancedSettingsProps {
    onSelectOpen?: (open: boolean) => void;
}

export function AdvancedSettings({ onSelectOpen }: AdvancedSettingsProps) {
    const tr = useT();
    const $animateMapMovements = useStore(animateMapMovements);
    const $highlightTrainLines = useStore(highlightTrainLines);
    const $thunderforestApiKey = useStore(thunderforestApiKey);
    const $pastebinApiKey = useStore(pastebinApiKey);
    const $alwaysUsePastebin = useStore(alwaysUsePastebin);
    const $planningMode = useStore(planningModeEnabled);
    const $autoSave = useStore(autoSave);
    const $customInitPref = useStore(customInitPreference);
    const $followMe = useStore(followMe);
    const $hiderMode = useStore(hiderMode);
    useStore(triggerLocalRefresh);

    return (
        <div style={{ padding: "0 16px" }}>
            {/* ── Kartenbewegungen animieren ── */}
            <SettingsRow title={tr("options.animateMapMovements")}>
                <Switch
                    checked={$animateMapMovements}
                    onCheckedChange={() =>
                        animateMapMovements.set(!$animateMapMovements)
                    }
                />
            </SettingsRow>

            {/* ── Bahnlinien hervorheben ── */}
            <SettingsRow title={tr("options.highlightTrainLines")}>
                <Switch
                    checked={$highlightTrainLines}
                    onCheckedChange={() =>
                        highlightTrainLines.set(!$highlightTrainLines)
                    }
                />
            </SettingsRow>

            {/* ── Thunderforest API key (conditional) ── */}
            {$highlightTrainLines && (
                <div style={{ padding: "8px 0 14px", borderBottom: "1px solid rgba(245,245,240,0.08)" }}>
                    <div style={{ color: "#99A1AF", fontSize: 13, marginBottom: 6 }}>
                        {tr("options.thunderforestApiKey")}
                    </div>
                    <Input
                        type="text"
                        value={$thunderforestApiKey}
                        onChange={(e) => thunderforestApiKey.set(e.target.value)}
                        placeholder={tr("options.thunderforestApiKey")}
                    />
                    <p style={{ color: "#6B7280", fontSize: 11, marginTop: 4 }}>
                        {tr("options.thunderforestApiKeyHelp1")}{" "}
                        <a
                            href="https://manage.thunderforest.com/users/sign_up?price=hobby-project-usd"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#60A5FA" }}
                        >
                            {tr("options.thunderforestApiKeyHere")}
                        </a>
                        . {tr("options.thunderforestApiKeyHelp2")}
                    </p>
                </div>
            )}

            {/* ── Pastebin API key ── */}
            <div style={{ padding: "8px 0 14px", borderBottom: "1px solid rgba(245,245,240,0.08)" }}>
                <div style={{ color: "#99A1AF", fontSize: 13, marginBottom: 6 }}>
                    {tr("options.pastebinApiKey")}
                </div>
                <Input
                    type="text"
                    value={$pastebinApiKey}
                    onChange={(e) => pastebinApiKey.set(e.target.value)}
                    placeholder={tr("options.pastebinApiKey")}
                />
                <p style={{ color: "#6B7280", fontSize: 11, marginTop: 4 }}>
                    {tr("options.pastebinApiKeyHelp1")}{" "}
                    <a
                        href="https://pastebin.com/doc_api"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#60A5FA" }}
                    >
                        {tr("options.pastebinApiKeyHere")}
                    </a>
                    .
                </p>
            </div>

            {/* ── Pastebin erzwingen ── */}
            <SettingsRow title={tr("options.forcePastebin")}>
                <Switch
                    checked={$alwaysUsePastebin}
                    onCheckedChange={() =>
                        alwaysUsePastebin.set(!$alwaysUsePastebin)
                    }
                />
            </SettingsRow>

            {/* ── Planungsmodus ── */}
            <SettingsRow title={tr("options.planningMode")}>
                <Switch
                    checked={$planningMode}
                    onCheckedChange={() => {
                        if ($planningMode === true) {
                            const map = leafletMapContext.get();
                            if (map) {
                                map.eachLayer((layer: any) => {
                                    if (
                                        layer.questionKey ||
                                        layer.questionKey === 0
                                    ) {
                                        map.removeLayer(layer);
                                    }
                                });
                            }
                        } else {
                            questions.set([...questions.get()]);
                        }
                        planningModeEnabled.set(!$planningMode);
                    }}
                />
            </SettingsRow>

            {/* ── Automatisch speichern ── */}
            <SettingsRow title={tr("options.autoSave")}>
                <Switch
                    checked={$autoSave}
                    onCheckedChange={() => autoSave.set(!$autoSave)}
                />
            </SettingsRow>

            {/* ── Neue benutzerdefinierte Frage – Standard ── */}
            <SettingsRow title={tr("options.newCustomQuestionDefaults")}>
                <Select
                    trigger={tr("options.newCustomQuestionDefaults")}
                    options={{
                        ask: tr("selectOption.askEachTime"),
                        blank: tr("selectOption.startBlank"),
                        prefill: tr("selectOption.copyFromCurrent"),
                    }}
                    value={$customInitPref}
                    onValueChange={(v) =>
                        customInitPreference.set(v as any)
                    }
                    onOpenChange={onSelectOpen}
                />
            </SettingsRow>

            {/* ── Mir folgen (GPS) ── */}
            <SettingsRow title={tr("options.followMe")}>
                <Switch
                    checked={$followMe}
                    onCheckedChange={() => followMe.set(!$followMe)}
                />
            </SettingsRow>

            {/* ── Verstecker-Modus ── */}
            <SettingsRow title={tr("options.hiderMode")}>
                <Switch
                    checked={!!$hiderMode}
                    onCheckedChange={() => {
                        if ($hiderMode === false) {
                            const $leafletMapContext = leafletMapContext.get();
                            if ($leafletMapContext) {
                                const center = $leafletMapContext.getCenter();
                                hiderMode.set({
                                    latitude: center.lat,
                                    longitude: center.lng,
                                });
                            } else {
                                hiderMode.set({
                                    latitude: 0,
                                    longitude: 0,
                                });
                            }
                        } else {
                            hiderMode.set(false);
                        }
                    }}
                />
            </SettingsRow>

            {/* ── Hider location editor (conditional) ── */}
            {$hiderMode !== false && (
                <div style={{ padding: "8px 0 14px" }}>
                    <SidebarMenu>
                        <LatitudeLongitude
                            latitude={$hiderMode.latitude}
                            longitude={$hiderMode.longitude}
                            inlineEdit
                            onChange={(latitude, longitude) => {
                                $hiderMode.latitude =
                                    latitude ?? $hiderMode.latitude;
                                $hiderMode.longitude =
                                    longitude ?? $hiderMode.longitude;

                                if ($autoSave) {
                                    hiderMode.set({ ...$hiderMode });
                                } else {
                                    triggerLocalRefresh.set(Math.random());
                                }
                            }}
                            label={tr("options.hiderLocation")}
                        />
                        {!$autoSave && (
                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    className="bg-blue-600 p-2 rounded-md font-semibold font-poppins transition-shadow duration-500 mt-2"
                                    onClick={save}
                                >
                                    {tr("options.save")}
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        )}
                    </SidebarMenu>
                </div>
            )}
        </div>
    );
}
