declare module "qrcode/lib/core/qrcode" {
    type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

    const QRCodeCore: {
        create: (
            value: string,
            options: { errorCorrectionLevel: ErrorCorrectionLevel },
        ) => {
            modules: {
                data: boolean[];
                size: number;
            };
        };
    };

    export = QRCodeCore;
}
