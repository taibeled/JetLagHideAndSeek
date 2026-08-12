import { atom } from "nanostores";

export type SidebarContextType = {
    state: "expanded" | "collapsed";
    open: boolean;
    setOpen: (open: boolean) => void;
    openMobile: boolean;
    setOpenMobile: (open: boolean) => void;
    isMobile: boolean;
    toggleSidebar: () => void;
};

/**
 * Each sidebar (left / right) owns its own state atom. The factory keeps the
 * defaults in one place so the two instances cannot drift apart.
 */
export const createSidebarContext = () =>
    atom<SidebarContextType>({
        state: "expanded",
        open: true,
        setOpen: () => {},
        openMobile: false,
        setOpenMobile: () => {},
        isMobile: false,
        toggleSidebar: () => {},
    });
