import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function writeBlob(
    dataDir: string,
    sid: string,
    payloadUtf8: string,
): Promise<void> {
    const shard = sid.slice(0, 2);
    const dir = join(dataDir, "blobs", shard);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, sid), payloadUtf8, "utf8");
}

export async function readBlob(
    dataDir: string,
    sid: string,
): Promise<string | null> {
    try {
        const shard = sid.slice(0, 2);
        return await readFile(join(dataDir, "blobs", shard, sid), "utf8");
    } catch {
        return null;
    }
}

export async function blobExists(dataDir: string, sid: string): Promise<boolean> {
    try {
        const shard = sid.slice(0, 2);
        await access(join(dataDir, "blobs", shard, sid));
        return true;
    } catch {
        return false;
    }
}
