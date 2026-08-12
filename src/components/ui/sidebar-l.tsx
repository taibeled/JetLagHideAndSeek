import { TbMessage2Question } from "react-icons/tb";

import { createSidebarComponents } from "@/components/ui/sidebar-core";
import { SidebarContext } from "@/components/ui/sidebar-l-context";
import { useTutorialStep } from "@/hooks/use-tutorial-step";

const SIDEBAR_TUTORIAL_STEPS = [6];

const { Sidebar, SidebarMenuButton, SidebarProvider, SidebarTrigger } =
    createSidebarComponents(SidebarContext, {
        triggerIcon: <TbMessage2Question />,
        // The tutorial forces the left sidebar open while it points at it.
        useDisplayState: ({ state, openMobile }) => ({
            state: useTutorialStep(
                state,
                SIDEBAR_TUTORIAL_STEPS,
                "expanded",
                "collapsed",
            ),
            openMobile: useTutorialStep(openMobile, SIDEBAR_TUTORIAL_STEPS),
        }),
    });

export {
    MENU_ITEM_CLASSNAME,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuItem,
} from "@/components/ui/sidebar-core";
export {
    Sidebar,
    SidebarMenuButton,
    SidebarProvider,
    SidebarTrigger,
};
