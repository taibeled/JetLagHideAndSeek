interface SettingsRowProps {
    title: string;
    description?: string;
    children?: React.ReactNode;
}

export function SettingsRow({ title, description, children }: SettingsRowProps) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "14px 0",
                borderBottom: "1px solid rgba(245,245,240,0.08)",
            }}
        >
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        color: "#fff",
                        fontSize: 15,
                        fontWeight: 600,
                        lineHeight: 1.3,
                    }}
                >
                    {title}
                </div>
                {description && (
                    <div
                        style={{
                            color: "#99A1AF",
                            fontSize: 13,
                            lineHeight: 1.4,
                            marginTop: 2,
                        }}
                    >
                        {description}
                    </div>
                )}
            </div>
            <div style={{ flexShrink: 0 }}>{children}</div>
        </div>
    );
}
