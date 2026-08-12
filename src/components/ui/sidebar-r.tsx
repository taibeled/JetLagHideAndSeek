import { LiaThumbtackSolid } from "react-icons/lia";

import { createSidebarContext } from "@/components/ui/sidebar-context";
import { createSidebarComponents } from "@/components/ui/sidebar-core";

export const SidebarContext = createSidebarContext();

const { Sidebar, SidebarProvider, SidebarTrigger } = createSidebarComponents(
    SidebarContext,
    { triggerIcon: <LiaThumbtackSolid /> },
);

export {
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
} from "@/components/ui/sidebar-core";
export { Sidebar, SidebarProvider, SidebarTrigger };
