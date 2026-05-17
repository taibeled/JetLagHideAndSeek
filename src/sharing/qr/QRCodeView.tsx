import QRCodeCore from "qrcode/lib/core/qrcode";
import Svg, { G, Path, Rect } from "react-native-svg";

import { colors } from "@/theme/colors";

type QRCodeViewProps = {
    backgroundColor?: string;
    color?: string;
    size: number;
    value: string;
};

export function QRCodeView({
    backgroundColor = colors.card,
    color = colors.ink,
    size,
    value,
}: QRCodeViewProps) {
    const matrix = QRCodeCore.create(value, {
        errorCorrectionLevel: "M",
    }).modules;
    const cellSize = size / matrix.size;
    const path = buildPath(matrix.data, matrix.size, cellSize);

    return (
        <Svg
            height={size}
            testID="qr-code-value"
            viewBox={`0 0 ${size} ${size}`}
            width={size}
        >
            <G>
                <Rect
                    fill={backgroundColor}
                    height={size}
                    width={size}
                    x={0}
                    y={0}
                />
            </G>
            <G>
                <Path
                    d={path}
                    stroke={color}
                    strokeLinecap="butt"
                    strokeWidth={cellSize}
                />
            </G>
        </Svg>
    );
}

function buildPath(data: boolean[], dimension: number, cellSize: number) {
    let path = "";

    for (let row = 0; row < dimension; row += 1) {
        let drawing = false;
        for (let column = 0; column < dimension; column += 1) {
            const isDark = data[row * dimension + column];
            if (isDark && !drawing) {
                path += `M${cellSize * column} ${
                    cellSize / 2 + cellSize * row
                } `;
                drawing = true;
            }
            if (drawing && (!isDark || column === dimension - 1)) {
                const endColumn = isDark ? column + 1 : column;
                path += `L${cellSize * endColumn} ${
                    cellSize / 2 + cellSize * row
                } `;
                drawing = false;
            }
        }
    }

    return path;
}
