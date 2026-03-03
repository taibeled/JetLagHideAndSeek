/**
 * PickerFooter — reusable footer action bar for all question config screens.
 *
 * Layout:
 *   [optional note / distance label]
 *   [primary button — red pill, full width]
 *   [secondary button — dark pill, full width]  (optional)
 *   [cancel link]                                (optional)
 */

export interface PickerFooterProps {
    primaryLabel: string;
    onPrimary: () => void;
    primaryDisabled?: boolean;

    secondaryLabel?: string;
    onSecondary?: () => void;
    secondaryDisabled?: boolean;

    cancelLabel?: string;
    onCancel?: () => void;
    cancelDisabled?: boolean;

    /** Small info line rendered above the buttons, e.g. "Entfernung: 5.234 km" */
    note?: string;
}

export function PickerFooter({
    primaryLabel,
    onPrimary,
    primaryDisabled,
    secondaryLabel,
    onSecondary,
    secondaryDisabled,
    cancelLabel = "Abbrechen",
    onCancel,
    cancelDisabled,
    note,
}: PickerFooterProps) {
    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "12px 16px 28px",
            flexShrink: 0,
        }}>
            {note && (
                <span style={{
                    color: "#99A1AF",
                    fontSize: "12px",
                    fontWeight: 500,
                    textAlign: "center",
                }}>
                    {note}
                </span>
            )}

            <button
                type="button"
                onClick={onPrimary}
                disabled={primaryDisabled}
                style={{
                    padding: "14px 20px",
                    borderRadius: 999,
                    border: "none",
                    cursor: primaryDisabled ? "not-allowed" : "pointer",
                    fontSize: "15px",
                    fontWeight: 800,
                    fontFamily: "Poppins, sans-serif",
                    background: primaryDisabled ? "rgba(232,50,58,0.35)" : "var(--color-primary)",
                    color: "#fff",
                    transition: "background 0.15s",
                    width: "100%",
                }}
            >
                {primaryLabel}
            </button>

            {secondaryLabel && (
                <button
                    type="button"
                    onClick={onSecondary}
                    disabled={secondaryDisabled}
                    style={{
                        padding: "14px 20px",
                        borderRadius: 999,
                        border: "none",
                        cursor: secondaryDisabled ? "not-allowed" : "pointer",
                        fontSize: "15px",
                        fontWeight: 700,
                        fontFamily: "Poppins, sans-serif",
                        background: "#2A2A3A",
                        color: secondaryDisabled ? "rgba(255,255,255,0.4)" : "#fff",
                        width: "100%",
                    }}
                >
                    {secondaryLabel}
                </button>
            )}

            {onCancel && (
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={cancelDisabled}
                    style={{
                        background: "none",
                        border: "none",
                        cursor: cancelDisabled ? "not-allowed" : "pointer",
                        fontSize: "13px",
                        color: "rgba(255,255,255,0.5)",
                        textDecoration: "underline",
                        padding: "4px 0",
                        opacity: cancelDisabled ? 0.4 : 1,
                        alignSelf: "center",
                    }}
                >
                    {cancelLabel}
                </button>
            )}
        </div>
    );
}
