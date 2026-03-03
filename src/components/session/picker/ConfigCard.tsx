/**
 * ConfigCard — dark card with a colored left accent bar.
 * Used in question config screens for Start/End points or other config blocks.
 */

const ACCENT_COLOR: Record<"red" | "green" | "blue" | "yellow", string> = {
    red:    "#E8323A",
    green:  "#22C55E",
    blue:   "#067BC2",
    yellow: "#F59E0B",
};

export interface ConfigCardProps {
    accentColor: "red" | "green" | "blue" | "yellow";
    /** Optional badge label shown at the top in accent color */
    title?: string;
    children: React.ReactNode;
}

export function ConfigCard({ accentColor, title, children }: ConfigCardProps) {
    const accent = ACCENT_COLOR[accentColor];
    return (
        <div style={{
            background: "#2A2A3A",
            borderRadius: 12,
            borderLeft: `4px solid ${accent}`,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
        }}>
            {title && (
                <span style={{
                    color: accent,
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontFamily: "Poppins, sans-serif",
                }}>
                    {title}
                </span>
            )}
            {children}
        </div>
    );
}
