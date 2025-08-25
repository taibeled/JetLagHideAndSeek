import React from "react";

import { cn } from "@/lib/utils";

import { Input } from "./input";
import { Label } from "./label";
import { SidebarMenuItem } from "./sidebar-l";

type FriendlyNameInputProps = {
    defaultDisplayName?: string;
    data: {
        friendlyName?: string;
        drag: boolean;
    };
    isLoading: boolean;
    onChange: (newValue: string) => void;
};

export const FriendlyNameInput: React.FC<FriendlyNameInputProps> = ({
    defaultDisplayName,
    data,
    isLoading,
    onChange,
}) => {
    return (
        <SidebarMenuItem>
            <div className={cn("gap-2 flex flex-row items-center gap-2", "MENU_ITEM_CLASSNAME")}>
                <Label
                    className={cn(
                        "font-semibold text-m",
                        isLoading && "text-muted-foreground",
                    )}
                >
                    Display Name
                </Label>
                <Input
                    type="string"
                    className="rounded-md p-2 w-32"
                    placeholder={defaultDisplayName}
                    value={data.friendlyName}
                    disabled={!data.drag || isLoading}
                    onChange={(e) => onChange(e.target.value)}
                />
            </div>
        </SidebarMenuItem>
    );
};
