import type { Units } from "@/lib/schema";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/select";

export const UnitSelect = ({
    unit,
    onChange,
}: {
    unit: Units;
    onChange: (unit: Units) => void;
}) => {
    return (
        <Select value={unit} onValueChange={onChange}>
            <SelectTrigger>
                <SelectValue placeholder="Unit" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="miles">Miles</SelectItem>
                <SelectItem value="kilometers">Kilometers</SelectItem>
                <SelectItem value="meters">Meters</SelectItem>
            </SelectContent>
        </Select>
    );
};
