import { VscChevronDown, VscShare, VscTrash } from "react-icons/vsc";
import { useState } from "react";
import { useStore } from "@nanostores/react";
import { cn } from "@/lib/utils";
import { questions } from "@/lib/context";
import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
} from "../ui/sidebar-l";
import { Separator } from "../ui/separator";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogHeader,
} from "../ui/dialog";
import { Button } from "@/components/ui/button.tsx";
import { LockIcon, UnlockIcon } from "lucide-react";

export const QuestionCard = ({
    children,
    questionKey,
    className,
    label,
    sub,
    showDeleteButton,
    collapsed,
    locked,
    setLocked,
    setCollapsed,
}: {
    children: React.ReactNode;
    questionKey: number;
    className?: string;
    label?: string;
    sub?: string;
    showDeleteButton?: boolean;
    collapsed?: boolean;
    locked?: boolean;
    setLocked?: (locked: boolean) => void;
    setCollapsed?: (collapsed: boolean) => void;
}) => {
    const [isCollapsed, setIsCollapsed] = useState(collapsed ?? false);
    const $questions = useStore(questions);

    const toggleCollapse = () => {
        if (setCollapsed) {
            setCollapsed(!isCollapsed);
        }
        setIsCollapsed((prevState) => !prevState);
    };

    return (
        <>
            <SidebarGroup className={className}>
                <div className="relative">
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

                <div className="flex gap-2 pt-2 px-2 justify-center">
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                                <VscShare />
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle className="text-2xl">
                                    Share this Question!
                                </DialogTitle>
                                <DialogDescription>
                                    Below you can access the JSON representing
                                    the question. Send this to another player
                                    for them to copy. They can then click
                                    &ldquo;Paste Question&rdquo; at the bottom
                                    of the &ldquo;Questions&rdquo; sidebar.
                                </DialogDescription>
                            </DialogHeader>
                            <textarea
                                className="w-full h-[300px] bg-slate-900 text-white rounded-md p-2"
                                readOnly
                                value={JSON.stringify(
                                    $questions.find(
                                        (q) => q.key === questionKey,
                                    ),
                                    null,
                                    4,
                                )}
                            ></textarea>
                        </DialogContent>
                    </Dialog>
                    {showDeleteButton && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <VscTrash />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>
                                        Are you absolutely sure?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action cannot be undone. This will
                                        permanently delete the question.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>
                                        Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() => {
                                            questions.set([]);
                                        }}
                                    >
                                        Delete All Questions
                                    </AlertDialogAction>
                                    <AlertDialogAction
                                        onClick={() => {
                                            questions.set(
                                                $questions.filter(
                                                    (q) =>
                                                        q.key !== questionKey,
                                                ),
                                            );
                                        }}
                                        className="mb-2 sm:mb-0"
                                    >
                                        Delete Question
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                    {locked !== undefined && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLocked!(!locked)}
                        >
                            {locked ? <LockIcon /> : <UnlockIcon />}
                        </Button>
                    )}
                </div>
            </SidebarGroup>
            <Separator className="h-1" />
        </>
    );
};
