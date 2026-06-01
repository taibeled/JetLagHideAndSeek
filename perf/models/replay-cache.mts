export type CacheEnvelope<T> = {
    cachedAt: number;
    value: T;
};

export type CacheResult<T> = {
    source: "memory" | "network" | "persisted" | "stale";
    value: T;
};

export class MemoryCacheStorage {
    private readonly values = new Map<string, string>();

    async getItem(key: string): Promise<string | null> {
        return this.values.get(key) ?? null;
    }

    async setItem(key: string, value: string): Promise<void> {
        this.values.set(key, value);
    }
}

export class ReplayCache<T> {
    private readonly inflight = new Map<string, Promise<T>>();
    private readonly memory = new Map<string, CacheEnvelope<T>>();

    constructor(
        private readonly storage: MemoryCacheStorage,
        private readonly now: () => number,
        private readonly ttlMs: number,
    ) {}

    clearMemory(): void {
        this.memory.clear();
    }

    async get(key: string, load: () => Promise<T>): Promise<CacheResult<T>> {
        const memory = this.memory.get(key);
        if (memory) return this.useEnvelope(key, memory, load, "memory");

        const raw = await this.storage.getItem(key);
        if (raw) {
            const persisted = JSON.parse(raw) as CacheEnvelope<T>;
            this.memory.set(key, persisted);
            return this.useEnvelope(key, persisted, load, "persisted");
        }

        return { source: "network", value: await this.refresh(key, load) };
    }

    async seed(key: string, envelope: CacheEnvelope<T>): Promise<void> {
        await this.storage.setItem(key, JSON.stringify(envelope));
    }

    private async useEnvelope(
        key: string,
        envelope: CacheEnvelope<T>,
        load: () => Promise<T>,
        freshSource: "memory" | "persisted",
    ): Promise<CacheResult<T>> {
        if (this.now() - envelope.cachedAt < this.ttlMs) {
            return { source: freshSource, value: envelope.value };
        }

        void this.refresh(key, load);
        return { source: "stale", value: envelope.value };
    }

    private refresh(key: string, load: () => Promise<T>): Promise<T> {
        const existing = this.inflight.get(key);
        if (existing) return existing;

        const request = load()
            .then(async (value) => {
                const envelope = { cachedAt: this.now(), value };
                this.memory.set(key, envelope);
                await this.storage.setItem(key, JSON.stringify(envelope));
                return value;
            })
            .finally(() => {
                this.inflight.delete(key);
            });
        this.inflight.set(key, request);
        return request;
    }
}

export class LatestResponse<T> {
    private generation = 0;
    private value: T | null = null;

    current(): T | null {
        return this.value;
    }

    async request(load: () => Promise<T>): Promise<void> {
        const requestGeneration = ++this.generation;
        const value = await load();
        if (requestGeneration === this.generation) {
            this.value = value;
        }
    }
}
