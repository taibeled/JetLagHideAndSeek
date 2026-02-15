import { type RefObject, useEffect, useState } from "react";
import { MdOutlineVerticalAlignTop } from "react-icons/md";

import { Button, type ButtonProps } from "@/components/ui/button";

export function ScrollToTop({
    minHeight, // Height from which button will be visible
    scrollTo, // Height to go on scroll to top
    element,
    ...props
}: ButtonProps & {
    minHeight?: number;
    scrollTo?: number;
    element?: RefObject<HTMLDivElement | null>;
}) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const onScroll = () => {
            if (element) {
                if (!element.current) return;
                setVisible(element.current.scrollTop >= (minHeight ?? 0));
            } else {
                setVisible(
                    document.documentElement.scrollTop >= (minHeight ?? 0),
                );
            }
        };

        onScroll();

        if (element) {
            if (!element.current) return;
            element.current.addEventListener("scroll", onScroll);
            return () =>
                element.current?.removeEventListener("scroll", onScroll);
        }

        document.addEventListener("scroll", onScroll);
        return () => document.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <>
            {visible && (
                <Button
                    onClick={() => {
                        if (element) {
                            if (!element.current) return;
                            element.current.scrollTo({
                                top: scrollTo ?? 0,
                                behavior: "smooth",
                            });
                        } else {
                            window.scrollTo({
                                top: scrollTo ?? 0,
                                behavior: "smooth",
                            });
                        }
                    }}
                    variant="ghost"
                    className="fixed rounded-full right-2 w-12 h-12 z-[1050] hover:bg-slate-500 p-1"
                    {...props}
                >
                    <MdOutlineVerticalAlignTop className="!w-1/2 !h-1/2 " />
                </Button>
            )}
        </>
    );
}
