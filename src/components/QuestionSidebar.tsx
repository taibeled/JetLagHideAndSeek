import { useStore } from "@nanostores/react";
import { SidebarCloseIcon } from "lucide-react";

import {
    Sidebar,
    SidebarContent,
    SidebarContext,
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";
import {
    autoSave,
    isLoading,
    questions,
    save,
    team,
    triggerLocalRefresh,
} from "@/lib/context";

import { AddQuestionDialog } from "./AddQuestionDialog";
import { renderQuestionCard } from "./QuestionCards";

export const QuestionSidebar = () => {
    useStore(triggerLocalRefresh);
    const $questions = useStore(questions);
    const $autoSave = useStore(autoSave);
    const $isLoading = useStore(isLoading);
    const $team = useStore(team);

    return (
        <Sidebar>
            <div className="flex items-start justify-between gap-2">
                <div className="ml-4 mt-4 flex min-w-0 flex-1 flex-col gap-0.5">
                    {$team ? (
                        <p
                            className="truncate text-sm font-medium font-poppins text-muted-foreground"
                            title={$team.name}
                        >
                            {$team.name}
                        </p>
                    ) : null}
                    <h2 className="font-poppins text-2xl">Questions</h2>
                </div>
                <SidebarCloseIcon
                    className="mr-2 mt-4 shrink-0 visible md:hidden"
                    onClick={() => {
                        SidebarContext.get().setOpenMobile(false);
                    }}
                />
            </div>
            <SidebarContent>
                {$questions.map((question) => renderQuestionCard(question))}
            </SidebarContent>
            <SidebarGroup>
                <SidebarGroupContent>
                    <SidebarMenu data-tutorial-id="add-questions-buttons">
                        <SidebarMenuItem>
                            <AddQuestionDialog>
                                <SidebarMenuButton disabled={$isLoading}>
                                    Add Question
                                </SidebarMenuButton>
                            </AddQuestionDialog>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <a
                                href="https://github.com/taibeled/JetLagHideAndSeek"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <SidebarMenuButton className="bg-emerald-600 transition-colors">
                                    Star this on GitHub! It&apos;s free :)
                                </SidebarMenuButton>
                            </a>
                        </SidebarMenuItem>
                        {!$autoSave && (
                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    className="bg-blue-600 p-2 rounded-md font-semibold font-poppins transition-shadow duration-500"
                                    onClick={save}
                                    disabled={$isLoading}
                                >
                                    Save
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        )}
                    </SidebarMenu>
                </SidebarGroupContent>
            </SidebarGroup>
        </Sidebar>
    );
};
