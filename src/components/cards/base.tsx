import { VscChromeClose, VscChevronDown } from "react-icons/vsc";
import { useState } from "react";
import { useStore } from "@nanostores/react";
import { cn } from "../../lib/utils";
import { questions } from "../../lib/context";
import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
} from "../ui/sidebar-l";
import { Separator } from "../ui/separator";

export const QuestionCard = ({
    children,
    questionKey,
    className,
    label,
    sub,
    showDeleteButton,
}: {
    children: React.ReactNode;
    questionKey: number;
    className?: string;
    label?: string;
    sub?: string;
    showDeleteButton?: boolean;
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const $questions = useStore(questions);

    const toggleCollapse = () => {
        setIsCollapsed((prevState) => !prevState);
    };

    return (
        <>
            <SidebarGroup className={className}>
                <div className="relative">
                    {showDeleteButton && (
                        <button
                            className="absolute top-2 right-2 text-white"
                            onClick={() => {
                                questions.set(
                                    $questions.filter(
                                        (q) => q.key !== questionKey,
                                    ),
                                );
                            }}
                        >
                            <VscChromeClose />
                        </button>
                    )}
                    <button
                        onClick={toggleCollapse}
                        className={cn(
                            "absolute top-2 left-2 text-white border rounded-md transition-all duration-500",
                            isCollapsed && "-rotate-90",
                        )}
                    >
                        <VscChevronDown />
                    </button>
                    <SidebarGroupLabel className="ml-8 mr-8">
                        {label} {sub && `(${sub})`}
                    </SidebarGroupLabel>
                    <SidebarGroupContent
                        className={cn(
                            "overflow-hidden transition-all duration-1000 max-h-[100rem]", // 100rem is arbitrary
                            isCollapsed && "max-h-0",
                        )}
                    >
                        <SidebarMenu>{children}</SidebarMenu>
                    </SidebarGroupContent>
                </div>
            </SidebarGroup>
            <Separator className="h-1" />
        </>
    );
};
