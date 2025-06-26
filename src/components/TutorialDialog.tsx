import { useStore } from "@nanostores/react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import {
    AlertDialog,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { showTutorial, tutorialStep } from "@/lib/context";
import { cn } from "@/lib/utils";

import { RadiusQuestionComponent } from "./QuestionCards";
import { SidebarGroup, SidebarMenu } from "./ui/sidebar-l";

interface TutorialStep {
    title: string;
    content: ReactNode;
    targetSelector?: string; // CSS selector for the element to highlight
    position?: "top" | "bottom" | "center"; // Where to position the dialog relative to target
    isDescription?: boolean;
}

const tutorialSteps: TutorialStep[] = [
    {
        title: "Welcome to the Jet Lag Hide and Seek Map Generator!",
        content: (
            <>
                This is a tutorial to help you get started! If you already know
                how to use this tool, feel free to click &ldquo;Skip
                Tutorial&rdquo; below. Furthermore, please note that this tool
                is intended solely for those who have purchased the Jet Lag Hide
                and Seek Home Game. However, it is not affiliated with them.
                Nonetheless, if you do want to support this tool, please
                consider{" "}
                <a
                    href="https://github.com/taibeled/JetLagHideAndSeek"
                    className="text-blue-500 cursor-pointer"
                    target="_blank"
                    rel="noreferrer"
                >
                    starring the repository on GitHub
                </a>{" "}
                or sharing it with your friends! Both are free ways to show
                support.
            </>
        ),
        position: "center",
    },
    {
        title: "Setting Your Location",
        content: (
            <>
                Before playing the game, you must coordinate some aspects with
                other players. First, set your location. Proceed to the next
                step to see the menu.
            </>
        ),
        targetSelector: '[data-tutorial-id="place-picker"]',
        position: "bottom",
    },
    {
        title: "Setting Your Location (continued)",
        content: (
            <>
                In this menu, you can determine the location that you will play
                the game in. To start, search for a location and click it. Then,
                it will be added to the map. You can also change it to subtract
                from the map by clicking the + button next to the location. If
                you want to remove a location, click the X button next to it.
                Coordinate this with other players.
            </>
        ),
        targetSelector: '[data-tutorial-id="place-picker-content"]',
        position: "bottom",
    },
    {
        title: "Setting Your Location (continued 2)",
        content: (
            <>
                In addition to using preset locations, you can also draw the
                bounds with polygons. We will get to sharing this with other
                players later.
            </>
        ),
        targetSelector: ".leaflet-draw-draw-polygon",
        position: "top",
    },
    {
        title: "Adding Questions",
        content: (
            <>
                Once you have coordinated the location with other players, you
                can start the game. First, you need to add questions. One of the
                ways of doing this is by opening the question sidebar. To do
                that, click the highlighted button. Proceed to the next step for
                it to be clicked automatically.
            </>
        ),
        targetSelector: '[data-tutorial-id="left-sidebar-trigger"]',
        position: "bottom",
    },
    {
        title: "Adding Questions (continued)",
        content: (
            <>
                Having opened the sidebar, you can now add questions by clicking
                one of the highlighted buttons.
            </>
        ),
        targetSelector: '[data-tutorial-id="add-questions-buttons"]',
        position: "top",
    },
    {
        title: "Question Properties",
        content: (
            <>
                Below is a sample question.{" "}
                <strong>Do not modify anything in it now.</strong> However, in
                your game, you will be able to modify the size of the radius,
                the units, the location, and whether the hider is within the
                radius or outside of it. Similar functions exist for all other
                question types (excluding photos for obvious reasons). In total,
                this tool has implemented 48 different unique questions!
                <SidebarGroup className="text-foreground">
                    <SidebarMenu>
                        <RadiusQuestionComponent
                            questionKey={Math.random()}
                            data={{
                                collapsed: false,
                                drag: true,
                                lat: Math.random() * 180 - 90,
                                lng: Math.random() * 360 - 180,
                                radius: 10,
                                unit: "miles",
                                color: "blue",
                                within: false,
                            }}
                        />
                    </SidebarMenu>
                </SidebarGroup>
            </>
        ),
        isDescription: false,
        position: "center",
    },
    {
        title: "Sharing Questions",
        content: (
            <>
                Once you have decided on either the location or the questions,
                you can share them with other players by clicking the
                highlighted button. This will generate a link that you can send
                to other players. They can then open the link to see all aspects
                of the game state.
            </>
        ),
        targetSelector: '[data-tutorial-id="share-questions-button"]',
        position: "top",
    },
    {
        title: "Options",
        content: (
            <>
                This tool also has many options that you can configure. One of
                the most important ones is &ldquo;Hider Mode&rdquo;. If you
                enable it, the hider will be asked to enter their location. All
                questions will then automatically be answered accordingly.{" "}
                <strong>
                    A neat trick is to have the seekers share the link with the
                    questions they are to ask and then have the hider open that
                    link while in Hider Mode. Then, they can share their new
                    state with the seekers, automatically answering all of the
                    questions.
                </strong>{" "}
                Don&apos;t worry, the hider&apos;s location will not be shared
                with the seekers through this route.
                <br />
                There are many more options, most of which are rather
                self-explanatory.
            </>
        ),
        targetSelector: '[data-tutorial-id="option-questions-button"]',
        position: "top",
    },
    {
        title: "Enjoy!",
        content: (
            <>
                You are now ready to play the game! If you have any questions,
                feel free to{" "}
                <a
                    href="https://github.com/taibeled/JetLagHideAndSeek/issues"
                    className="text-blue-500 cursor-pointer"
                    target="_blank"
                    rel="noreferrer"
                >
                    post an issue on GitHub.
                </a>{" "}
                I&apos;d love to hear your feedback and suggestions for
                improvements. One final pitch, if you want to support the, as of
                writing this, 11,421 lines of code comprising this project,
                please consider{" "}
                <a
                    href="https://github.com/taibeled/JetLagHideAndSeek"
                    className="text-blue-500 cursor-pointer"
                    target="_blank"
                    rel="noreferrer"
                >
                    leaving a free GitHub star.
                </a>{" "}
                Thank you!
            </>
        ),
        position: "center",
    },
];

const TutorialOverlay = ({
    targetSelector,
    isVisible,
}: {
    targetSelector?: string;
    isVisible: boolean;
}) => {
    const [highlightedElement, setHighlightedElement] =
        useState<Element | null>(null);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (!isVisible || !targetSelector) {
                setHighlightedElement(null);
                return;
            }

            setHighlightedElement(
                document.querySelector(targetSelector) || null,
            );
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [targetSelector, isVisible]);

    if (!isVisible) {
        return null;
    }

    const rect = highlightedElement?.getBoundingClientRect();
    const padding = 12;

    return (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
            {highlightedElement && rect ? (
                <div>
                    <div
                        className="absolute transition-all duration-500 ease-out tutorial-highlight-pulse"
                        style={{
                            left: rect.left - padding,
                            top: rect.top - padding,
                            width: rect.width + padding * 2,
                            height: rect.height + padding * 2,
                            boxShadow: `
                                    0 0 0 4px rgba(59, 130, 246, 0.8),
                                    0 0 0 8px rgba(59, 130, 246, 0.4),
                                    0 0 0 9999px rgba(0, 0, 0, 0.6),
                                    0 0 30px rgba(59, 130, 246, 0.6)
                                `,
                            borderRadius: "12px",
                            border: "3px solid rgb(59, 130, 246)",
                            background: "transparent",
                            zIndex: 10000,
                        }}
                    >
                        <div
                            className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-400/20 to-purple-400/20"
                            style={{
                                animation: "breathe 3s infinite ease-in-out",
                            }}
                        />
                    </div>
                </div>
            ) : (
                <div className="absolute inset-0 bg-black/60 transition-opacity duration-300" />
            )}
        </div>
    );
};

export const TutorialDialog = () => {
    const $showTutorial = useStore(showTutorial);
    const dialogRef = useRef<HTMLDivElement>(null);
    const $tutorialStep = useStore(tutorialStep);

    const handleNext = () => {
        if ($tutorialStep < tutorialSteps.length - 1) {
            tutorialStep.set($tutorialStep + 1);
        }
    };

    const handlePrevious = () => {
        if ($tutorialStep > 0) {
            tutorialStep.set($tutorialStep - 1);
        }
    };
    const handleClose = () => {
        showTutorial.set(false);
    };

    const currentTutorialStep = tutorialSteps[$tutorialStep];

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (!$showTutorial || !dialogRef.current) return;

            const dialogElement = dialogRef.current;
            const isMobile = window.innerWidth < 768; // Tailwind md breakpoint
            const maxWidth = isMobile ? window.innerWidth - 40 : 680;

            dialogElement.style.maxWidth = `${maxWidth}px`;
            dialogElement.style.width = "auto";
            dialogElement.style.height = "auto";

            if (!currentTutorialStep.targetSelector) {
                dialogElement.style.position = "fixed";
                dialogElement.style.left = "50%";
                dialogElement.style.top = "50%";
                dialogElement.style.transform = "translate(-50%, -50%)";
                dialogElement.style.right = "auto";
                dialogElement.style.bottom = "auto";
                return;
            }

            const targetElement = document.querySelector(
                currentTutorialStep.targetSelector,
            ) as HTMLElement;

            if (!targetElement) {
                // If target element not found, center the dialog
                dialogElement.style.position = "fixed";
                dialogElement.style.left = "50%";
                dialogElement.style.top = "50%";
                dialogElement.style.transform = "translate(-50%, -50%)";
                dialogElement.style.right = "auto";
                dialogElement.style.bottom = "auto";
                return;
            }

            const rect = targetElement.getBoundingClientRect();
            const position = currentTutorialStep.position || "center";
            const padding = 20;

            // Ensure positioning is set but don't reset transform immediately
            dialogElement.style.position = "fixed";

            const dialogRect = dialogElement.getBoundingClientRect();
            const dialogWidth = Math.min(
                dialogRect.width || 680,
                isMobile ? window.innerWidth - padding * 2 : 680,
            );
            const dialogHeight = dialogRect.height || 400;

            let finalX = 0;
            let finalY = 0;

            // On mobile, use simpler positioning logic
            if (isMobile) {
                // On mobile, always center horizontally and position vertically based on target
                finalX = (window.innerWidth - dialogWidth) / 2;

                switch (position) {
                    case "top": {
                        finalY = Math.max(
                            padding,
                            rect.top - dialogHeight - padding,
                        );
                        // If no space above, move to below
                        if (finalY < padding) {
                            finalY = Math.min(
                                rect.bottom + padding,
                                window.innerHeight - dialogHeight - padding,
                            );
                        }
                        break;
                    }
                    case "bottom": {
                        finalY = Math.min(
                            rect.bottom + padding,
                            window.innerHeight - dialogHeight - padding,
                        );
                        // If no space below, move to above
                        if (
                            finalY + dialogHeight >
                            window.innerHeight - padding
                        ) {
                            finalY = Math.max(
                                padding,
                                rect.top - dialogHeight - padding,
                            );
                        }
                        break;
                    }
                    default:
                        // Center
                        finalY = (window.innerHeight - dialogHeight) / 2;
                        break;
                }

                // Ensure dialog stays within viewport bounds
                finalY = Math.max(
                    padding,
                    Math.min(
                        finalY,
                        window.innerHeight - dialogHeight - padding,
                    ),
                );
            } else {
                // Desktop positioning logic (unchanged)
                switch (position) {
                    case "top": {
                        finalX = Math.max(
                            padding,
                            Math.min(
                                window.innerWidth - dialogWidth - padding,
                                rect.left + rect.width / 2 - dialogWidth / 2,
                            ),
                        );
                        finalY = Math.max(
                            padding,
                            rect.top - dialogHeight - padding,
                        );
                        // If no space above, flip to below
                        if (finalY < padding) {
                            finalY = rect.bottom + padding;
                        }
                        break;
                    }
                    case "bottom": {
                        finalX = Math.max(
                            padding,
                            Math.min(
                                window.innerWidth - dialogWidth - padding,
                                rect.left + rect.width / 2 - dialogWidth / 2,
                            ),
                        );
                        finalY = rect.bottom + padding;
                        // If no space below, flip to above
                        if (
                            finalY + dialogHeight >
                            window.innerHeight - padding
                        ) {
                            finalY = Math.max(
                                padding,
                                rect.top - dialogHeight - padding,
                            );
                        }
                        break;
                    }
                    default:
                        // Center
                        dialogElement.style.left = "50%";
                        dialogElement.style.top = "50%";
                        dialogElement.style.transform = "translate(-50%, -50%)";
                        dialogElement.style.right = "auto";
                        dialogElement.style.bottom = "auto";
                        return;
                }
            }

            // Apply positioning smoothly
            dialogElement.style.transform = "none";
            dialogElement.style.left = `${finalX}px`;
            dialogElement.style.top = `${finalY}px`;
            dialogElement.style.right = "auto";
            dialogElement.style.bottom = "auto";
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [$tutorialStep, $showTutorial]);

    useEffect(() => {
        if (!$showTutorial) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            switch (event.key) {
                case "ArrowRight":
                case "ArrowDown":
                    event.preventDefault();
                    handleNext();
                    break;
                case "ArrowLeft":
                case "ArrowUp":
                    event.preventDefault();
                    handlePrevious();
                    break;
                case "Escape":
                    event.preventDefault();
                    handleClose();
                    break;
                case "Enter":
                case " ":
                    event.preventDefault();
                    if ($tutorialStep === tutorialSteps.length - 1) {
                        handleClose();
                    } else {
                        handleNext();
                    }
                    break;
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [$showTutorial, $tutorialStep]);

    return (
        <>
            <TutorialOverlay
                targetSelector={currentTutorialStep.targetSelector}
                isVisible={$showTutorial}
            />
            <AlertDialog open={$showTutorial} onOpenChange={showTutorial.set}>
                <AlertDialogPrimitive.AlertDialogContent
                    ref={dialogRef}
                    className={cn(
                        "fixed z-[10000] grid w-full gap-4 border bg-background p-4 md:p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
                        "!max-h-[50vh] overflow-y-auto tutorial-dialog",
                        // Only apply default center positioning for non-targeted steps
                        !currentTutorialStep.targetSelector &&
                            "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] !max-h-[90vh]",
                    )}
                    style={{
                        maxWidth: "min(680px, calc(100vw - 40px))",
                        width: "auto",
                        transition:
                            "left 0.3s ease-out, top 0.3s ease-out, transform 0.3s ease-out",
                    }}
                    data-tutorial-active={$showTutorial}
                >
                    <AlertDialogHeader className="space-y-4">
                        <div className="flex items-center justify-between">
                            <AlertDialogTitle className="text-2xl font-bold text-left">
                                {currentTutorialStep.title}
                            </AlertDialogTitle>
                        </div>

                        <div className="flex space-x-2">
                            {tutorialSteps.map((_, index) => (
                                <div
                                    key={index}
                                    className={`h-2 rounded-full flex-1 ${
                                        index <= $tutorialStep
                                            ? "bg-blue-500"
                                            : "bg-gray-300"
                                    }`}
                                />
                            ))}
                        </div>
                    </AlertDialogHeader>

                    {(currentTutorialStep.isDescription ?? true) ? (
                        <AlertDialogDescription className="text-base leading-relaxed whitespace-pre-line">
                            {currentTutorialStep.content}
                        </AlertDialogDescription>
                    ) : (
                        <div className="text-base leading-relaxed whitespace-pre-line text-muted-foreground">
                            {currentTutorialStep.content}
                        </div>
                    )}

                    <div className="flex flex-col gap-y-2 justify-between items-center pt-4">
                        <div className="flex items-center space-x-2">
                            <Button
                                variant="outline"
                                onClick={handleClose}
                                className="text-sm"
                            >
                                Skip Tutorial
                            </Button>
                            <div className="hidden md:block text-xs text-muted-foreground">
                                Use arrow keys to navigate
                            </div>
                            <div className="text-sm text-muted-foreground">
                                {$tutorialStep + 1} of {tutorialSteps.length}
                            </div>
                        </div>

                        <div className="flex items-center space-x-2">
                            <Button
                                variant="outline"
                                onClick={handlePrevious}
                                disabled={$tutorialStep === 0}
                                className="flex items-center space-x-1"
                            >
                                <ChevronLeft className="h-4 w-4" />
                                <span>Previous</span>
                            </Button>
                            {$tutorialStep === tutorialSteps.length - 1 ? (
                                <Button
                                    onClick={handleClose}
                                    variant="secondary"
                                >
                                    <span>Get Started!</span>
                                </Button>
                            ) : (
                                <Button
                                    onClick={handleNext}
                                    className="flex items-center space-x-1"
                                >
                                    <span>Next</span>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                </AlertDialogPrimitive.AlertDialogContent>
            </AlertDialog>
        </>
    );
};
