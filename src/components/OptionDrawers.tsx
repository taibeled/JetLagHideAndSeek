import { useStore } from "@nanostores/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

import {
    Drawer,
    DrawerContent,
    DrawerTrigger,
} from "@/components/ui/drawer";
import {
    defaultUnit,
    hidingRadiusUnits,
} from "@/lib/context";
import { cn, decompress, fetchFromPastebin } from "@/lib/utils";
import { loadHidingZone } from "@/lib/hiding-zone-loader";
import { locale, t, useT } from "@/i18n";

import { HelpCircle, Settings, SlidersHorizontal } from "lucide-react";

import { GeneralSettings } from "./settings/GeneralSettings";
import { AdvancedSettings } from "./settings/AdvancedSettings";
import { Button } from "./ui/button";

const HIDING_ZONE_URL_PARAM = "hz";
const HIDING_ZONE_COMPRESSED_URL_PARAM = "hzc";
const PASTEBIN_URL_PARAM = "pb";

type SettingsTab = "general" | "advanced";

interface OptionDrawersProps {
    className?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    showTrigger?: boolean;
}

export const OptionDrawers = ({
    className,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    showTrigger = true,
}: OptionDrawersProps) => {
    const tr = useT();
    const $defaultUnit = useStore(defaultUnit);
    const lastDefaultUnit = useRef($defaultUnit);
    const hasSyncedInitialUnit = useRef(false);
    const [internalOpen, setInternalOpen] = useState(false);
    const [hasOpenSelect, setHasOpenSelect] = useState(false);
    const [tab, setTab] = useState<SettingsTab>("general");

    const isOptionsOpen =
        controlledOpen !== undefined ? controlledOpen : internalOpen;
    const setOptionsOpen =
        controlledOnOpenChange !== undefined
            ? controlledOnOpenChange
            : setInternalOpen;

    // Sync hiding radius units with default unit
    useEffect(() => {
        const currentDefault = $defaultUnit;
        if (!hasSyncedInitialUnit.current) {
            hasSyncedInitialUnit.current = true;
            if (hidingRadiusUnits.get() !== currentDefault) {
                hidingRadiusUnits.set(currentDefault);
            }
        } else if (lastDefaultUnit.current !== currentDefault) {
            hidingRadiusUnits.set(currentDefault);
        }
        lastDefaultUnit.current = currentDefault;
    }, [$defaultUnit]);

    // URL parameter loading (hiding zone import)
    useEffect(() => {
        const params = new URL(window.location.toString()).searchParams;
        const hidingZoneOld = params.get(HIDING_ZONE_URL_PARAM);
        const hidingZoneCompressed = params.get(HIDING_ZONE_COMPRESSED_URL_PARAM);
        const pastebinId = params.get(PASTEBIN_URL_PARAM);

        if (hidingZoneOld !== null) {
            try {
                loadHidingZone(atob(hidingZoneOld));
                window.history.replaceState({}, "", window.location.pathname);
            } catch (e) {
                toast.error(t("toast.options.hidingZoneInvalid", locale.get()));
            }
        } else if (hidingZoneCompressed !== null) {
            decompress(hidingZoneCompressed).then((data) => {
                try {
                    loadHidingZone(data);
                    window.history.replaceState({}, "", window.location.pathname);
                } catch (e) {
                    toast.error(t("toast.options.hidingZoneInvalid", locale.get()));
                }
            });
        } else if (pastebinId !== null) {
            fetchFromPastebin(pastebinId)
                .then((data) => {
                    try {
                        loadHidingZone(data);
                        window.history.replaceState({}, "", window.location.pathname);
                        toast.success(t("toast.options.hidingZoneLoaded", locale.get()));
                    } catch (e) {
                        toast.error(t("toast.options.hidingZoneInvalid", locale.get()));
                    }
                })
                .catch((error) => {
                    console.error("Failed to fetch from Pastebin:", error);
                    toast.error(t("toast.options.hidingZoneInvalid", locale.get()));
                });
        }
    }, []);

    return (
        <div
            className={cn(
                "flex justify-end gap-2 max-[412px]:!mb-4 max-[340px]:flex-col",
                className,
            )}
        >
            <Drawer open={isOptionsOpen} onOpenChange={setOptionsOpen}>
                {showTrigger && (
                    <DrawerTrigger asChild>
                        <Button
                            className="shadow-md w-10 h-10 p-0"
                            data-tutorial-id="option-questions-button"
                            aria-label={tr("settings.title")}
                        >
                            <Settings className="h-5 w-5" />
                        </Button>
                    </DrawerTrigger>
                )}
                <DrawerContent
                    className="!bg-[#1E1E2A] !border-t-2 !border-t-[var(--hs-primary)]"
                    onPointerDownOutside={(e) => {
                        if (hasOpenSelect) e.preventDefault();
                    }}
                >
                    {/* ── Header ── */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "12px 20px 0",
                        }}
                    >
                        <h2
                            style={{
                                color: "#fff",
                                fontSize: 20,
                                fontWeight: 700,
                                fontFamily: "'Poppins', sans-serif",
                                margin: 0,
                            }}
                        >
                            {tr("settings.title")}
                        </h2>
                        <button
                            style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: 4,
                                color: "#99A1AF",
                            }}
                            aria-label="Help"
                        >
                            <HelpCircle size={20} />
                        </button>
                    </div>

                    {/* ── Tab bar ── */}
                    <div
                        style={{
                            display: "flex",
                            gap: 0,
                            borderBottom: "1px solid rgba(245,245,240,0.08)",
                            padding: "0 16px",
                            marginTop: 8,
                        }}
                    >
                        <TabButton
                            active={tab === "general"}
                            onClick={() => setTab("general")}
                            icon={<Settings size={15} />}
                            label={tr("settings.tabGeneral")}
                        />
                        <TabButton
                            active={tab === "advanced"}
                            onClick={() => setTab("advanced")}
                            icon={<SlidersHorizontal size={15} />}
                            label={tr("settings.tabAdvanced")}
                        />
                    </div>

                    {/* ── Scrollable content ── */}
                    <div
                        style={{
                            overflowY: "auto",
                            maxHeight: "60vh",
                            scrollbarWidth: "thin",
                            scrollbarColor: "var(--hs-primary) transparent",
                            paddingBottom: 16,
                        }}
                    >
                        {tab === "general" && (
                            <GeneralSettings onSelectOpen={setHasOpenSelect} />
                        )}
                        {tab === "advanced" && (
                            <AdvancedSettings onSelectOpen={setHasOpenSelect} />
                        )}
                    </div>
                </DrawerContent>
            </Drawer>
        </div>
    );
};

// ── Tab button (same pattern as QuestionPickerSheet) ─────────────────────────

function TabButton({
    active,
    onClick,
    icon,
    label,
}: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
}) {
    return (
        <button
            onClick={onClick}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 16px",
                background: "none",
                border: "none",
                borderBottom: active
                    ? "2px solid var(--color-primary)"
                    : "2px solid transparent",
                cursor: "pointer",
                color: active ? "#fff" : "#99A1AF",
                fontSize: "13px",
                fontWeight: active ? 700 : 500,
                letterSpacing: "0.02em",
                marginBottom: "-1px",
                transition: "color 0.15s",
            }}
        >
            <span style={{ opacity: active ? 1 : 0.7 }}>{icon}</span>
            {label}
        </button>
    );
}
