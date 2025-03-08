import { useState } from "react";
import { AiOutlineFullscreen, AiOutlineFullscreenExit } from "react-icons/ai";

export const LeafletFullScreenButton = () => {
    const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

    return (
        <a
            className="leaflet-full-screen-specific-name bg-white hover:bg-[#f4f4f4] w-[30px] h-[30px] rounded-sm leading-[30px] text-[22px] flex items-center justify-center border-2 border-black border-opacity-30 cursor-pointer"
            onClick={() => {
                const dialogContainer: HTMLDivElement | null =
                    document.querySelector(
                        "#map-modal-dialog-container-leaflet",
                    );

                if (!document.fullscreenElement) {
                    if (dialogContainer) {
                        dialogContainer.requestFullscreen();
                    }
                    setIsFullScreen(true);
                } else {
                    document.exitFullscreen();
                    setIsFullScreen(false);
                }
            }}
        >
            {isFullScreen ? (
                <AiOutlineFullscreenExit className="w-6 h-6 text-black" />
            ) : (
                <AiOutlineFullscreen className="w-6 h-6 text-black" />
            )}
        </a>
    );
};
