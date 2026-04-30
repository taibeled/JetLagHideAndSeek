import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const queues = new Map<string, Promise<void>>();

export type TeamSnapshotRow = { sid: string; ts: number };

function enqueue(teamId: string, task: () => Promise<void>): Promise<void> {
    const prev = queues.get(teamId) ?? Promise.resolve();
    let next: Promise<void>;
    next = prev.then(task).finally(() => {
        if (queues.get(teamId) === next) {
            queues.delete(teamId);
        }
    });
    queues.set(teamId, next);
    return next;
}

export async function appendTeamSnapshotLine(
    dataDir: string,
    teamId: string,
    row: TeamSnapshotRow,
    maxEntries: number,
): Promise<void> {
    return enqueue(teamId, async () => {
        const teamsDir = join(dataDir, "teams");
        await mkdir(teamsDir, { recursive: true });
        const filePath = join(teamsDir, `${teamId}.jsonl`);
        let lines: string[] = [];
        try {
            const raw = await readFile(filePath, "utf8");
            lines = raw.trimEnd().split("\n").filter(Boolean);
        } catch {
            lines = [];
        }
        const last = lines.length
            ? (JSON.parse(lines[lines.length - 1]!) as TeamSnapshotRow)
            : null;
        if (last && last.sid === row.sid) {
            return;
        }
        if (lines.length >= maxEntries) {
            throw new Error("Team snapshot log exceeded CAS_MAX_TEAM_ENTRIES");
        }
        await appendFile(filePath, `${JSON.stringify(row)}\n`, "utf8");
    });
}

export async function readTeamSnapshots(
    dataDir: string,
    teamId: string,
): Promise<TeamSnapshotRow[]> {
    const filePath = join(dataDir, "teams", `${teamId}.jsonl`);
    try {
        const raw = await readFile(filePath, "utf8");
        return raw
            .trimEnd()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line) as TeamSnapshotRow);
    } catch {
        return [];
    }
}
