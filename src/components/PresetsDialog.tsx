import * as React from "react";

import CustomPresets from "@/components/CustomPresets";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

type Props = {
    data: any;
    presetTypeHint: string;
    triggerLabel?: string;
};

const PresetsDialog: React.FC<Props> = ({
    data,
    presetTypeHint,
    triggerLabel = "Use presets",
}) => {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button size="sm" className="w-full">
                    {triggerLabel}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogTitle>Custom Presets</DialogTitle>
                <CustomPresets data={data} presetTypeHint={presetTypeHint} />
            </DialogContent>
        </Dialog>
    );
};

export default PresetsDialog;
