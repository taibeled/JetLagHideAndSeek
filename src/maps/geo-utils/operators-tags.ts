/**
 * OSM operator / network helpers for hiding-zone filtering (global, tag-based).
 */

export function normalizeOsmText(v: unknown): string | undefined {
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t.length > 0 ? t : undefined;
}

/** Escape for use inside OverpassQL double-quoted regex operand. */
function escapeOverpassRegexPattern(s: string): string {
    return s
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/[\\.^$*+?()[\]{}|]/g, "\\$&");
}

function buildTagRegexClause(
    tagKey: "operator" | "network",
    ops: string[],
): string {
    const trimmed = [...new Set(ops.map((s) => s.trim()).filter(Boolean))];
    if (trimmed.length === 0) return "";
    const alt = trimmed.map(escapeOverpassRegexPattern).join("|");
    return `[${tagKey}~"^(${alt})$",i]`;
}

/**
 * For each base filter string, returns Overpass filter strings to union
 * (operator + network) so stations tagged with only one of these still match.
 */
export function expandFiltersForOperatorNetwork(
    baseFilter: string,
    alternatives: string[],
    operatorFilter: string[],
): { primaryLines: string[]; alternativeLines: string[] } {
    const ops = operatorFilter.map((s) => s.trim()).filter(Boolean);
    if (ops.length === 0) {
        return {
            primaryLines: [baseFilter],
            alternativeLines: [...alternatives],
        };
    }
    const opClause = buildTagRegexClause("operator", ops);
    const netClause = buildTagRegexClause("network", ops);
    const primaryLines = [
        `${baseFilter}${opClause}`,
        `${baseFilter}${netClause}`,
    ];
    const alternativeLines = alternatives.flatMap((alt) => [
        `${alt}${opClause}`,
        `${alt}${netClause}`,
    ]);
    return { primaryLines, alternativeLines };
}

export function getOperatorAndNetwork(
    osmProperties: Record<string, unknown> | undefined,
): { operator?: string; network?: string } {
    if (!osmProperties) return {};
    return {
        operator: normalizeOsmText(osmProperties.operator),
        network: normalizeOsmText(osmProperties.network),
    };
}

/**
 * True if no selection, or station's operator or network (case-insensitive) is in selected.
 */
/** OSM feature ids from osmtogeojson look like `node/123`, `way/…`, `relation/…`. */
export function isLikelyOsmElementId(id: unknown): boolean {
    return typeof id === "string" && /^(node|way|relation)\//.test(id);
}

export function matchesOperatorSelection(
    osmProperties: Record<string, unknown> | undefined,
    selected: string[],
): boolean {
    if (!selected.length) return true;
    const normSelected = new Set(
        selected.map((s) => s.trim().toLowerCase()).filter(Boolean),
    );
    if (normSelected.size === 0) return true;
    const { operator, network } = getOperatorAndNetwork(osmProperties);
    const candidates = [operator, network]
        .filter(Boolean)
        .map((s) => s!.toLowerCase());
    return candidates.some((c) => normSelected.has(c));
}
