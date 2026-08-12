import { useStore } from "@nanostores/react";
import type * as React from "react";

import CustomInitDialog from "@/components/CustomInitDialog";
import PresetsDialog from "@/components/PresetsDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    MENU_ITEM_CLASSNAME,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";
import { UnitSelect } from "@/components/UnitSelect";
import {
    drawingQuestionKey,
    isLoading,
    questionModified,
    questions,
} from "@/lib/context";
import { cn } from "@/lib/utils";
import type { Question, Units } from "@/maps/schema";
import { determineUnionizedStrings, NO_GROUP } from "@/maps/schema";

/** Props every question card takes; `data` is that card's own question. */
export type QuestionCardComponentProps<T> = {
    data: T;
    questionKey: number;
    sub?: string;
    className?: string;
};

/** One member of a discriminated-union question schema. */
type UnionSchemaOption = { description?: string | undefined; shape: any };

const literalEntries = (option: UnionSchemaOption, field: string) =>
    determineUnionizedStrings(option.shape[field]).map(
        (literal) => [literal.value, literal.description] as [string, string],
    );

/**
 * Select options for the schema members that opted out of grouping
 * (`NO_GROUP`), keyed by the question's discriminator field.
 */
export const ungroupedTypeOptions = (
    options: readonly UnionSchemaOption[],
    field: string,
) =>
    Object.fromEntries(
        options
            .filter((option) => option.description === NO_GROUP)
            .flatMap((option) => literalEntries(option, field)),
    );

/**
 * Grouped Select options, merging schema members that share a group label
 * (e.g. several "Hiding Zone Mode" members).
 */
export const groupedTypeOptions = (
    options: readonly UnionSchemaOption[],
    field: string,
    { disabled = false }: { disabled?: boolean } = {},
) =>
    options
        .filter((option) => option.description !== NO_GROUP)
        .reduce<
            Record<string, { disabled: boolean; options: Record<string, string> }>
        >((acc, option) => {
            const group = option.description!;
            const entries = Object.fromEntries(literalEntries(option, field));

            acc[group] = {
                disabled,
                options: { ...acc[group]?.options, ...entries },
            };

            return acc;
        }, {});

const QUESTION_LABELS: Record<Question["id"], string> = {
    radius: "Radius",
    thermometer: "Thermometer",
    tentacles: "Tentacles",
    matching: "Matching",
    measuring: "Measuring",
};

/**
 * Card heading: the question's kind plus its position among the questions of
 * that same kind ("Radius 2").
 */
export const useQuestionLabel = (id: Question["id"], questionKey: number) => {
    const $questions = useStore(questions);

    const index =
        $questions
            .filter((q) => q.id === id)
            .map((q) => q.key)
            .indexOf(questionKey) + 1;

    return `${QUESTION_LABELS[id]}\n    ${index}`;
};

/**
 * Wires the card chrome — collapse, lock, hide — to the question's own data.
 * Spread into `QuestionCard`.
 */
export const questionCardControls = (data: {
    collapsed?: boolean;
    drag: boolean;
    hidden?: boolean;
}) => ({
    collapsed: data.collapsed,
    setCollapsed: (collapsed: boolean) => {
        data.collapsed = collapsed; // Doesn't trigger a re-render so no need for questionModified
    },
    locked: !data.drag,
    setLocked: (locked: boolean) => questionModified((data.drag = !locked)),
    hidden: data.hidden,
    setHidden: (hidden: boolean) => questionModified((data.hidden = hidden)),
});

/** Writes back whichever of the two coordinates the picker changed. */
export const applyLatLng =
    (data: { lat: number; lng: number }) =>
    (lat: number | null, lng: number | null) => {
        if (lat !== null) {
            data.lat = lat;
        }
        if (lng !== null) {
            data.lng = lng;
        }
        questionModified();
    };

export const HidingZoneClickNotice = () => (
    <span className="px-2 text-center text-orange-500">
        This question will only influence the map when you click on a hiding
        zone in the hiding zone sidebar.
    </span>
);

/** Numeric radius plus its unit, as used by the radius and tentacle cards. */
export const RadiusUnitRow = ({
    data,
    disabled,
}: {
    data: { radius: number; unit: Units };
    disabled?: boolean;
}) => (
    <SidebarMenuItem>
        <div className={cn(MENU_ITEM_CLASSNAME, "gap-2 flex flex-row")}>
            <Input
                type="number"
                className="rounded-md p-2 w-16"
                value={data.radius}
                disabled={disabled}
                onChange={(e) =>
                    questionModified((data.radius = parseFloat(e.target.value)))
                }
            />
            <UnitSelect
                unit={data.unit}
                disabled={disabled}
                onChange={(unit) => questionModified((data.unit = unit))}
            />
        </div>
    </SidebarMenuItem>
);

/**
 * "To modify …, enable it: [x] and use the buttons at the bottom left of the
 * map." plus the presets shortcut, shared by every draw-your-own question.
 */
export const DrawingEnableNotice = ({
    subject,
    questionKey,
    data,
    presetTypeHint,
    disabled,
}: {
    subject: React.ReactNode;
    questionKey: number;
    data: any;
    presetTypeHint: string;
    disabled?: boolean;
}) => {
    const $drawingQuestionKey = useStore(drawingQuestionKey);

    return (
        <>
            <p className="px-2 mb-1 text-center text-orange-500">
                To modify {subject}, enable it:
                <Checkbox
                    className="mx-1 my-1"
                    checked={$drawingQuestionKey === questionKey}
                    onCheckedChange={(checked) => {
                        if (checked) {
                            drawingQuestionKey.set(questionKey);
                        } else {
                            drawingQuestionKey.set(-1);
                        }
                    }}
                    disabled={disabled}
                />
                and use the buttons at the bottom left of the map.
            </p>
            <div className="flex justify-center mb-2">
                <PresetsDialog data={data} presetTypeHint={presetTypeHint} />
            </div>
        </>
    );
};

/**
 * `CustomInitDialog` with a single handler: cards initialise custom geometry
 * the same way for both choices apart from which seed they use.
 */
export const CustomInitChoiceDialog = ({
    open,
    onOpenChange,
    onChoice,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onChoice: (choice: "blank" | "prefill") => void | Promise<void>;
}) => (
    <CustomInitDialog
        open={open}
        onOpenChange={onOpenChange}
        onBlank={() => onChoice("blank")}
        onPrefill={() => onChoice("prefill")}
    />
);

/** The "Result" label plus whichever toggle group the question answers with. */
export const ResultRow = ({
    className,
    labelClassName,
    children,
}: {
    className?: string;
    labelClassName?: string;
    children: React.ReactNode;
}) => {
    const $isLoading = useStore(isLoading);

    return (
        <div className={cn("flex gap-2 items-center p-2", className)}>
            <Label
                className={cn(
                    "font-semibold text-lg",
                    $isLoading && "text-muted-foreground",
                    labelClassName,
                )}
            >
                Result
            </Label>
            {children}
        </div>
    );
};
