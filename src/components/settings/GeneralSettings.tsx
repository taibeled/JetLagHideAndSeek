import { useStore } from "@nanostores/react";
import { toast } from "react-toastify";

import { locale, t, useT } from "@/i18n";
import {
    autoZoom,
    defaultUnit,
    followMe,
    hidingZone,
    notificationsEnabled,
    offlineMapsEnabled,
    soundEnabled,
} from "@/lib/context";
import { loadHidingZone } from "@/lib/hiding-zone-loader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { UnitSelect } from "@/components/UnitSelect";

import { SessionCard } from "./SessionCard";
import { SettingsRow } from "./SettingsRow";

interface GeneralSettingsProps {
    onSelectOpen?: (open: boolean) => void;
}

export function GeneralSettings({ onSelectOpen }: GeneralSettingsProps) {
    const tr = useT();
    const $autoZoom = useStore(autoZoom);
    const $followMe = useStore(followMe);
    const $soundEnabled = useStore(soundEnabled);
    const $notificationsEnabled = useStore(notificationsEnabled);
    const $offlineMapsEnabled = useStore(offlineMapsEnabled);
    const $defaultUnit = useStore(defaultUnit);
    const $hidingZone = useStore(hidingZone);

    return (
        <div style={{ padding: "0 16px" }}>
            <SessionCard />

            {/* ── Sprache ── */}
            <SettingsRow
                title={tr("settings.language")}
                description={tr("settings.languageDesc")}
            >
                <div style={{ display: "flex", gap: 4 }}>
                    <Button
                        size="sm"
                        variant={locale.get() === "de" ? "default" : "outline"}
                        onClick={() => locale.set("de")}
                    >
                        DE
                    </Button>
                    <Button
                        size="sm"
                        variant={locale.get() === "en" ? "default" : "outline"}
                        onClick={() => locale.set("en")}
                    >
                        EN
                    </Button>
                </div>
            </SettingsRow>

            {/* ── Versteckzone kopieren ── */}
            <SettingsRow
                title={tr("settings.copyZone")}
                description={tr("settings.copyZoneDesc")}
            >
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                        if (!navigator?.clipboard) {
                            return toast.error(t("toast.options.clipboardNotSupported", locale.get()));
                        }
                        navigator.clipboard.writeText(JSON.stringify($hidingZone));
                        toast.success(t("toast.options.hidingZoneCopied", locale.get()), {
                            autoClose: 2000,
                        });
                    }}
                >
                    {tr("settings.copyButton")}
                </Button>
            </SettingsRow>

            {/* ── Versteckzone einfügen ── */}
            <SettingsRow
                title={tr("settings.pasteZone")}
                description={tr("settings.pasteZoneDesc")}
            >
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                        if (!navigator?.clipboard) {
                            return toast.error(t("toast.options.clipboardNotSupported", locale.get()));
                        }
                        navigator.clipboard.readText().then(loadHidingZone);
                    }}
                >
                    {tr("settings.pasteButton")}
                </Button>
            </SettingsRow>

            {/* ── Standardeinheit ── */}
            <SettingsRow
                title={tr("settings.defaultUnit")}
                description={tr("settings.defaultUnitDesc")}
            >
                <UnitSelect
                    unit={$defaultUnit}
                    onChange={defaultUnit.set}
                    onOpenChange={onSelectOpen}
                />
            </SettingsRow>

            {/* ── Automatisch zoomen ── */}
            <SettingsRow
                title={tr("settings.autoZoom")}
                description={tr("settings.autoZoomDesc")}
            >
                <Switch
                    checked={$autoZoom}
                    onCheckedChange={(v) => autoZoom.set(v)}
                />
            </SettingsRow>

            {/* ── Standort verwenden ── */}
            <SettingsRow
                title={tr("settings.useLocation")}
                description={tr("settings.useLocationDesc")}
            >
                <Switch
                    checked={$followMe}
                    onCheckedChange={(v) => followMe.set(v)}
                />
            </SettingsRow>

            {/* ── Ton ── */}
            <SettingsRow
                title={tr("settings.sound")}
                description={tr("settings.soundDesc")}
            >
                <Switch
                    checked={$soundEnabled}
                    onCheckedChange={(v) => soundEnabled.set(v)}
                />
            </SettingsRow>

            {/* ── Benachrichtigungen (UI placeholder) ── */}
            <SettingsRow
                title={tr("settings.notifications")}
                description={tr("settings.notificationsDesc")}
            >
                <Switch
                    checked={$notificationsEnabled}
                    onCheckedChange={(v) => notificationsEnabled.set(v)}
                />
            </SettingsRow>

            {/* ── Offline-Karten (UI placeholder) ── */}
            <SettingsRow
                title={tr("settings.offlineMaps")}
                description={tr("settings.offlineMapsDesc")}
            >
                <Switch
                    checked={$offlineMapsEnabled}
                    onCheckedChange={(v) => offlineMapsEnabled.set(v)}
                />
            </SettingsRow>
        </div>
    );
}
