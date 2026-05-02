import { useStore } from "@nanostores/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

import { Button } from "@/components/ui/button";
import { RawInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { getBlob, listTeamSnapshots, newTeamId } from "@/lib/cas";
import {
    casServerEffectiveUrl,
    casServerStatus,
    team,
    teamHistory,
} from "@/lib/context";
import { decompress } from "@/lib/utils";

type TeamPanelProps = {
    optionsOpen: boolean;
    /** Applies CAS payload after optional replace confirmation (parent handles sid + hydration). */
    onLoadCasWire: (canonicalJson: string, sid: string) => Promise<boolean>;
};

export const TeamPanel = ({
    optionsOpen,
    onLoadCasWire,
}: TeamPanelProps) => {
    const $team = useStore(team);
    const $casStatus = useStore(casServerStatus);
    const $effectiveUrl = useStore(casServerEffectiveUrl);
    const $history = useStore(teamHistory);
    const [creatingTeam, setCreatingTeam] = useState(false);
    const [renamingTeam, setRenamingTeam] = useState(false);
    const [nameDraft, setNameDraft] = useState("");
    const [leaveConfirm, setLeaveConfirm] = useState(false);

    const refreshHistory = useCallback(async () => {
        if ($casStatus !== "available" || !$effectiveUrl || !$team) return;
        try {
            const list = await listTeamSnapshots($effectiveUrl, $team.id);
            teamHistory.set(list);
        } catch (e) {
            toast.error(`Could not load team history: ${e}`);
        }
    }, [$casStatus, $effectiveUrl, $team]);

    useEffect(() => {
        if (!optionsOpen || !$team) return;
        void refreshHistory();
    }, [optionsOpen, $team, refreshHistory]);

    useEffect(() => {
        if (!optionsOpen) {
            setCreatingTeam(false);
            setRenamingTeam(false);
            setLeaveConfirm(false);
            setNameDraft("");
        }
    }, [optionsOpen]);

    const loadSnapshot = async (sid: string) => {
        if ($casStatus !== "available" || !$effectiveUrl) {
            toast.error("CAS server not available");
            return;
        }
        try {
            const compressed = await getBlob($effectiveUrl, sid);
            const json = await decompress(compressed);
            await onLoadCasWire(json, sid);
        } catch (e) {
            toast.error(`Could not load snapshot: ${e}`);
        }
    };

    const showTeamControls =
        $casStatus === "available" && $effectiveUrl !== null;

    if (!showTeamControls) {
        return (
            <div className="flex flex-col gap-2 text-center text-sm text-gray-500 max-w-md">
                <Separator className="bg-slate-300 w-[280px] mx-auto" />
                <Label className="text-lg font-poppins">Team workspace</Label>
                <p>
                    Connect to a game state server to create teams and browse
                    shared snapshot history.
                </p>
            </div>
        );
    }

    return (
        <>
            <Separator className="bg-slate-300 w-[280px]" />
            <Label className="text-lg font-poppins">Team workspace</Label>

            {!$team ? (
                creatingTeam ? (
                    <div className="flex flex-col gap-3 items-stretch w-full max-w-md">
                        <RawInput
                            placeholder="Team name"
                            value={nameDraft}
                            onChange={(e) => setNameDraft(e.target.value)}
                            autoComplete="off"
                            autoFocus
                        />
                        <div className="flex flex-wrap gap-2 justify-center">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setCreatingTeam(false);
                                    setNameDraft("");
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                className="shadow-md"
                                onClick={() => {
                                    const name = nameDraft.trim();
                                    if (!name) {
                                        toast.error("Enter a team name");
                                        return;
                                    }
                                    const id = newTeamId();
                                    team.set({ id, name });
                                    teamHistory.set([]);
                                    setCreatingTeam(false);
                                }}
                            >
                                Create
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button
                        type="button"
                        className="shadow-md"
                        onClick={() => {
                            setNameDraft("");
                            setCreatingTeam(true);
                        }}
                    >
                        New Team
                    </Button>
                )
            ) : (
                <div className="flex flex-col gap-3 items-center w-full max-w-md">
                    {renamingTeam ? (
                        <div className="flex flex-col gap-3 items-stretch w-full">
                            <RawInput
                                placeholder="Team name"
                                value={nameDraft}
                                onChange={(e) => setNameDraft(e.target.value)}
                                autoComplete="off"
                                autoFocus
                            />
                            <div className="flex flex-wrap gap-2 justify-center">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setRenamingTeam(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => {
                                        const name = nameDraft.trim();
                                        if (!$team || !name) return;
                                        team.set({ ...$team, name });
                                        setRenamingTeam(false);
                                    }}
                                >
                                    Save
                                </Button>
                            </div>
                        </div>
                    ) : leaveConfirm ? (
                        <div className="flex flex-col gap-3 items-center w-full text-center">
                            <p className="text-sm text-muted-foreground">
                                Clears this browser&apos;s team binding only.
                                Server-side snapshots remain available with the
                                team ID.
                            </p>
                            <div className="flex flex-wrap gap-2 justify-center">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setLeaveConfirm(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        team.set(null);
                                        teamHistory.set([]);
                                        setLeaveConfirm(false);
                                    }}
                                >
                                    Leave
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="text-center">
                                <div className="font-semibold font-poppins">
                                    {$team.name}
                                </div>
                                <div className="text-xs text-gray-500 break-all mt-1">
                                    Team ID: {$team.id}
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 justify-center">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setNameDraft($team.name);
                                        setRenamingTeam(true);
                                    }}
                                >
                                    Rename Team
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                        setLeaveConfirm(true)
                                    }
                                >
                                    Leave Team
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => void refreshHistory()}
                                >
                                    Refresh history
                                </Button>
                            </div>
                        </>
                    )}
                    <div className="w-full max-h-40 overflow-y-auto border rounded-md p-2 text-left text-sm space-y-1">
                        {$history.length === 0 ? (
                            <p className="text-gray-500 text-center">
                                No snapshots yet. Edit the map and wait a few
                                seconds after saving to record idle checkpoints.
                            </p>
                        ) : (
                            $history.map((row) => (
                                <button
                                    key={`${row.sid}-${row.ts}`}
                                    type="button"
                                    className="block w-full text-left px-2 py-1 rounded hover:bg-slate-100"
                                    onClick={() => void loadSnapshot(row.sid)}
                                >
                                    <span className="font-mono text-xs">
                                        {row.sid}
                                    </span>
                                    <span className="text-gray-500 ml-2">
                                        {new Date(row.ts).toLocaleString()}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </>
    );
};
