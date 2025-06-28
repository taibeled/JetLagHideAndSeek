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
import { SidebarGroup, SidebarMenu } from "@/components/ui/sidebar-l";
import { showTutorial, tutorialStep } from "@/lib/context";
import { cn } from "@/lib/utils";

import {
    MatchingQuestionComponent,
    MeasuringQuestionComponent,
    RadiusQuestionComponent,
    TentacleQuestionComponent,
    ThermometerQuestionComponent,
} from "./QuestionCards";

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
                Welcome to the the Hide and Seek map generator designed for the
                Jet Lag Home Game! This detailed tutorial will walk you through
                every feature, option, and question type available in this
                powerful tool.
                <br />
                <br />
                This tool is designed for those who have purchased the Jet Lag
                Hide and Seek Home Game, though it&apos;s not officially
                affiliated with the creators. It supports over 48 question
                variations found in the game!
                <br />
                <br />
                If you&apos;re already familiar with the basics, feel free to{" "}
                <strong>skip this tutorial by scrolling down</strong>. However,
                this guide covers advanced features you might not know about. To
                support this free tool, please consider{" "}
                <a
                    href="https://github.com/taibeled/JetLagHideAndSeek"
                    className="text-blue-500 cursor-pointer"
                    target="_blank"
                    rel="noreferrer"
                >
                    starring the repository on GitHub
                </a>{" "}
                or sharing it with fellow Jet Lag fans! Both are free ways to
                show your support.
            </>
        ),
        position: "center",
    },
    {
        title: "Overview: Game Setup Process",
        content: (
            <>
                Before diving into specifics, here&apos;s the typical workflow:
                <br />
                <br />
                <strong>1. Location Setup:</strong> Define your play area using
                preset locations or custom polygon drawing
                <br />
                <br />
                <strong>2. Question Creation:</strong> Add and configure the 5
                question types (Radius, Thermometer, Tentacles, Matching,
                Measuring)
                <br />
                <br />
                <strong>3. Sharing:</strong> Share the questions and game
                boundaries with other players
                <br />
                <br />
                <strong>4. Hider Mode:</strong> Let the hider automatically
                answer questions based on their location
                <br />
                <br />
                <strong>5. Zone Analysis:</strong> View potential hiding zones
                and their constraints
                <br />
                <br />
                Let&apos;s explore each step in detail!
            </>
        ),
        position: "center",
    },
    {
        title: "Location Setup: Place Picker",
        content: (
            <>
                The Place Picker allows you to define the game area based on
                presets. Click the search box to begin exploring locations.
                <br />
                <br />
                <strong>Supported Location Types:</strong>
                <br />• Cities, towns, and neighborhoods
                <br />• Administrative regions (countries, states, prefectures)
                <br />• Geographic features (islands, parks)
            </>
        ),
        targetSelector: '[data-tutorial-id="place-picker"]',
        position: "bottom",
    },
    {
        title: "Location Management: Add, Subtract, Remove",
        content: (
            <>
                Once you search for locations, this menu shows powerful
                management options:
                <br />
                <br />
                <strong>Adding Locations (+ button):</strong> Expands your play
                area by including the selected region
                <br />
                <br />
                <strong>Subtracting Locations (- button):</strong> Creates
                &ldquo;holes&rdquo; in your play area by excluding specific
                regions. Perfect for removing water bodies, restricted areas, or
                creating complex boundaries.
                <br />
                <br />
                <strong>Removing Locations (X button):</strong> Completely
                removes the location from your game
                <br />
                <br />
                <strong>
                    &ldquo;Clear Questions &amp; Cache&rdquo; button:
                </strong>{" "}
                Resets all questions and clears cached data when changing
                locations significantly
                <br />
                <br />
                <strong>
                    &ldquo;Reuse Preset Locations&rdquo; button:
                </strong>{" "}
                Appears when custom polygons exist, allowing you to return to
                the preset location mode
            </>
        ),
        targetSelector: '[data-tutorial-id="place-picker-content"]',
        position: "bottom",
    },
    {
        title: "Advanced Location Setup: Custom Polygon Drawing",
        content: (
            <>
                For custom play areas, the Polygon Tool allows you to draw:
                <br />
                <br />
                <strong>Polygon Tool:</strong> Draw custom boundaries that
                perfectly match your intended play area. Great for irregular
                shapes or when preset locations don&apos;t quite fit your needs.
                <br />
                <br />
                <strong>Drawing Tips:</strong>
                <br />• Click to start, continue clicking to add points
                <br />• Click the first point again to close the polygon
                <br />• Use multiple polygons to create complex areas
                <br />
                <br />
                <strong>Use Cases:</strong> University campuses, specific
                neighborhoods, custom game boundaries, or areas that cross
                multiple administrative regions.
            </>
        ),
        targetSelector: ".leaflet-draw-draw-polygon",
        position: "top",
    },
    {
        title: "Opening the Question Sidebar",
        content: (
            <>
                Adding questions can be done in two fashions, either through the
                sidebar, or on the map. To open the sidebar, you must click the
                highlighted button or proceed to the next step. Furthermore, to
                add a question on the map, you must either right-click on
                desktop or long-press on mobile. A question will be added at the
                clicked location, and you can then select the question type.
            </>
        ),
        targetSelector: '[data-tutorial-id="left-sidebar-trigger"]',
        position: "bottom",
    },
    {
        title: "Question Creation Interface (Part 1)",
        content: (
            <>
                This sidebar is your question command center. Each button
                creates a different question type. Proceed to the next step to
                learn about each question type in detail.
                {/* Scrolling does not function for the tutorial when the sidebar dialog is open. */}
            </>
        ),
        targetSelector: '[data-tutorial-id="add-questions-buttons"]',
        position: "top",
    },
    {
        title: "Question Creation Interface (Part 2)",
        content: (
            <>
                Here are the sample questions:
                <br />
                <br />
                <strong>1. RADIUS:</strong> &ldquo;Is the hider within X
                distance of this point?&rdquo;
                <br />
                <br />
                <strong>2. THERMOMETER:</strong> &ldquo;Is the hider closer to
                point A or point B?&rdquo;
                <br />
                <br />
                <strong>3. TENTACLES:</strong> &ldquo;What specific location
                within X distance of the seekers is the hider closest to?&rdquo;
                <br />
                <br />
                <strong>4. MATCHING:</strong> &ldquo;Does the hider share the
                same property as this reference point?&rdquo;
                <br />
                <br />
                <strong>5. MEASURING:</strong> &ldquo;Is the hider
                closer/farther than the seeker to this feature?&rdquo;
                <br />
                <br />
                Furthermore, here are the additional buttons:
                <br />
                <br />
                <strong>&ldquo;Paste Question&rdquo;:</strong> Feature to import
                questions from clipboard (JSON format)
                <br />
                <br />
                <strong>&ldquo;Save&rdquo; button:</strong> Appears when
                auto-save is disabled, allowing manual saves
            </>
        ),
        position: "center",
    },
    {
        title: "Radius Questions: The Foundation",
        content: (
            <>
                Radius questions are the simplest question type. Here&apos;s a
                sample question interface:
                <br />
                <br />
                <SidebarGroup className="text-foreground">
                    <SidebarMenu>
                        <RadiusQuestionComponent
                            questionKey={Math.random()}
                            data={{
                                collapsed: false,
                                drag: true,
                                lat: 35.6762,
                                lng: 139.6503,
                                radius: 10,
                                unit: "miles",
                                color: "blue",
                                within: false,
                            }}
                        />
                    </SidebarMenu>
                </SidebarGroup>
                <br />
                <strong>Radius Control:</strong> Set any distance (supports
                decimals)
                <br />
                <br />
                <strong>Units:</strong> Miles, kilometers, or meters
                <br />
                <br />
                <strong>Position:</strong> Drag the marker on the map or input
                exact coordinates. Alternatively, you can use your current
                location or paste a location
                <br />
                <br />
                <strong>Inside/Outside:</strong> Toggle whether the hider is
                within or outside the radius
                <br />
                <br />
                <strong>Lock/Unlock:</strong> Prevents accidental modifications
                when locked
            </>
        ),
        isDescription: false,
        position: "center",
    },
    {
        title: "Thermometer Questions: Relative Positioning",
        content: (
            <>
                Thermometer questions partition the map into two regions, both
                containing all points that are closer to either the start or
                end:
                <br />
                <br />
                <SidebarGroup className="text-foreground">
                    <SidebarMenu>
                        <ThermometerQuestionComponent
                            questionKey={Math.random()}
                            data={{
                                collapsed: false,
                                drag: true,
                                latA: 35.6762,
                                lngA: 139.6503,
                                latB: 35.6762,
                                lngB: 139.7503,
                                colorA: "red",
                                colorB: "blue",
                                warmer: false,
                            }}
                        />
                    </SidebarMenu>
                </SidebarGroup>
                <br />
                <strong>Two-Point System:</strong> Point A (the start point) and
                Point B (the end point), each with independent coordinates and
                colors
                <br />
                <br />
                <strong>&ldquo;Warmer&rdquo; Logic:</strong>
                <br />• Warmer = Hider is closer to Point B (the end point)
                <br />• Colder = Hider is closer to Point A (the start point)
                <br />
                <br />
                <strong>Coordinate Input:</strong> Set precise locations or drag
                markers visually
                <br />
                <br />
                <strong>Color Coding:</strong> Different colors help distinguish
                between points on the map
            </>
        ),
        position: "center",
    },
    {
        title: "Tentacles Questions: Location Discovery",
        content: (
            <>
                Tentacles questions identify specific locations within a radius,
                perfect for narrowing down exact hiding spots:
                <br />
                <br />
                <SidebarGroup className="text-foreground">
                    <SidebarMenu>
                        <TentacleQuestionComponent
                            questionKey={Math.random()}
                            data={{
                                collapsed: false,
                                drag: true,
                                lat: 35.6762,
                                lng: 139.6503,
                                radius: 15,
                                unit: "miles",
                                color: "red",
                                locationType: "theme_park",
                                location: false,
                            }}
                        />
                    </SidebarMenu>
                </SidebarGroup>
                <br />
                <strong>Location Types:</strong>
                <br />• <strong>15-Mile Radius:</strong> Theme Parks, Zoos,
                Aquariums
                <br />• <strong>1-Mile Radius:</strong> Museums, Hospitals,
                Cinemas, Libraries
                <br />• <strong>Custom:</strong> Define your own points of
                interest
                <br />
                <br />
                <strong>Radius Control:</strong> Adjusts the search area for
                finding locations
                <br />
                <br />
                <strong>Smart Detection:</strong> Automatically finds all
                qualifying locations within the radius using OpenStreetMap data
                <br />
                <br />
                <strong>Custom Mode:</strong> Enable drawing mode to manually
                place or edit location points
            </>
        ),
        position: "center",
    },
    {
        title: "Matching Questions: Property Comparison (Part 1)",
        content: (
            <>
                Matching questions compare properties between the hider&apos;s
                location and a reference point. This is the most complex
                question type with numerous variations:
                <br />
                <br />
                <SidebarGroup className="text-foreground">
                    <SidebarMenu>
                        <MatchingQuestionComponent
                            questionKey={Math.random()}
                            data={{
                                collapsed: false,
                                drag: true,
                                lat: 35.6762,
                                lng: 139.6503,
                                color: "blue",
                                same: true,
                                type: "airport",
                            }}
                        />
                    </SidebarMenu>
                </SidebarGroup>
                <br />
                <strong>Zone-Based Matching:</strong>
                <br />• <strong>Same Zone:</strong> Administrative regions
                (prefectures, states, etc.)
                <br />• <strong>Same First Letter of Zone:</strong> Zones
                starting with the same letter
                <br />• <strong>Zone Levels:</strong> OSM administrative levels
                3-10 for different granularities
                <br />
                <br />
                <strong>Airport Matching:</strong>
                <br />• Compares nearest commercial airports (those with IATA
                codes)
                <br />• Uses Voronoi diagrams to determine airport catchment
                areas
                <br />
                <br />
                <strong>City Matching:</strong>
                <br />• Compares nearest major cities (1,000,000+ population)
                <br />• Useful for large-scale geographic questions
            </>
        ),
        position: "center",
    },
    {
        title: "Matching Questions: Property Comparison (Part 2)",
        content: (
            <>
                <strong>Full Game Variations (Small/Medium Games):</strong>
                <br />
                These require the game area to be relatively small (alternatives
                also exist that function with Hiding Zone Mode for larger
                games):
                <br />• Aquariums, Zoos, Theme Parks
                <br />• Museums, Hospitals, Cinemas
                <br />• Libraries, Golf Courses, Foreign Consulates, Parks
                <br />
                <br />
                <strong>Hiding Zone Mode Variations:</strong>
                <br />
                These work specifically with train station data:
                <br />• <strong>Same First Letter of Station:</strong> Station
                names starting with the same letter
                <br />• <strong>Same Length Station Name:</strong> Station names
                with identical character counts
                <br />• <strong>Same Train Line:</strong> Stations connected by
                rail lines
                <br />
                <br />
                <strong>Custom Matching:</strong>
                <br />• <strong>Custom Zone:</strong> Draw your own zones for
                comparison
                <br />• <strong>Custom Points:</strong> Define your own point
                categories
            </>
        ),
        position: "center",
    },
    {
        title: "Measuring Questions: Distance Comparison (Part 1)",
        content: (
            <>
                Measuring questions compare the hider&apos;s distance to
                features against the seeker&apos;s distance:
                <br />
                <br />
                <SidebarGroup className="text-foreground">
                    <SidebarMenu>
                        <MeasuringQuestionComponent
                            questionKey={Math.random()}
                            data={{
                                collapsed: false,
                                drag: true,
                                lat: 35.6762,
                                lng: 139.6503,
                                color: "green",
                                hiderCloser: true,
                                type: "coastline",
                            }}
                        />
                    </SidebarMenu>
                </SidebarGroup>
                <br />
                <strong>Geographic Features:</strong>
                <br />• <strong>Coastline:</strong> Distance to nearest coast
                using detailed coastline data
                <br />• <strong>Commercial Airports:</strong> Distance to
                nearest airport with IATA code
                <br />• <strong>Major Cities:</strong> Distance to cities with
                1M+ population
                <br />• <strong>High-Speed Rail:</strong> Distance to high-speed
                rail lines (like Shinkansen)
                <br />
                <br />
                <strong>Full Game Variations:</strong>
                <br />
                Same location types as Matching questions but focused on
                distance rather than categorization:
                <br />• Aquariums, Zoos, Theme Parks, Museums
                <br />• Hospitals, Cinemas, Libraries
                <br />• Golf Courses, Foreign Consulates, Parks
                <br />
                <br />
                <strong>Closer/Farther Logic:</strong> Toggle whether the hider
                was closer or farther from where the seeker was
            </>
        ),
        position: "center",
    },
    {
        title: "Measuring Questions: Distance Comparison (Part 2)",
        content: (
            <>
                <strong>Hiding Zone Mode Variations:</strong>
                <br />
                These work with the zone analysis system:
                <br />• <strong>McDonald&apos;s:</strong> Distance to nearest
                McDonald&apos;s location
                <br />• <strong>7-Eleven:</strong> Distance to nearest 7-Eleven
                convenience store
                <br />• <strong>Train Station:</strong> Distance to nearest
                railway station
                <br />
                <br />
                <strong>Custom Measuring:</strong>
                <br />• <strong>Custom Measure:</strong> Draw your own features
                to measure distance to
                <br />• Enable drawing mode to create custom points or areas
                <br />• Perfect for game-specific features or local landmarks
                <br />
                <br />
                <strong>Implementation Details:</strong>
                <br />• Uses geodesic distance calculations for accuracy
                <br />• Buffers around features create zones of equal distance
                <br />• Results show which areas are closer/farther than the
                reference point
            </>
        ),
        position: "center",
    },
    {
        title: "Sharing and Collaboration Features",
        content: (
            <>
                Seamless sharing is crucial for multiplayer games. The sharing
                system offers multiple methods:
                <br />
                <br />
                <strong>URL Sharing:</strong>
                <br />• <strong>Direct Links:</strong> Embed entire game state
                in URL
                <br />• <strong>Compressed Links:</strong> Smaller URLs for
                complex games
                <br />• <strong>Pastebin Integration:</strong> For very large
                game states
                <br />
                <br />
                <strong>What Gets Shared:</strong>
                <br />• All location boundaries (preset and custom)
                <br />• Complete question configurations
                <br />• Question answers/results
                <br />• Game options and settings
                <br />• Visual customizations (colors, units)
                <br />
                <br />
                <strong>What Doesn&apos;t Get Shared:</strong>
                <br />• Hider&apos;s actual location (when using Hider Mode)
                <br />• Personal API keys
            </>
        ),
        targetSelector: '[data-tutorial-id="share-questions-button"]',
        position: "top",
    },
    {
        title: "Hider Mode: Automated Question Answering",
        content: (
            <>
                Hider Mode is the most powerful feature for streamlining
                gameplay:
                <br />
                <br />
                <strong>How It Works:</strong>
                <br />
                1. Hider receives game link from seekers
                <br />
                2. Enables Hider Mode and inputs their exact location
                <br />
                3. All questions are automatically answered based on their
                position
                <br />
                4. Hider shares the updated link with answers back to seekers
                <br />
                <br />
                <strong>Privacy:</strong> The hider&apos;s exact coordinates are
                never shared, only the question answers.
            </>
        ),
        position: "center",
    },
    {
        title: "Advanced Options and Settings",
        content: (
            <>
                The options menu contains powerful customization features that
                significantly impact your gameplay experience:
                <br />
                <br />
                <strong>Display Options:</strong>
                <br />• <strong>Auto-zoom:</strong> Automatically fits map to
                relevant areas when adding questions or analyzing zones. Disable
                for manual zoom control.
                <br />• <strong>Animate Map Movements:</strong> Smooth
                transitions between map positions vs instant jumps.
                <br />• <strong>Highlight Train Lines:</strong> Visual emphasis
                on railway networks. Requires Thunderforest API key but provides
                crucial visual context for train-related questions.
                <br />• <strong>Follow Me:</strong> GPS tracking for mobile use.
                Adds a marker that follows your location in real-time.
                <br />
                <br />
                <strong>Unit Preferences:</strong>
                <br />• <strong>Default Unit:</strong> Miles, kilometers, or
                meters for new questions. This becomes the default for all new
                questions. Choose based on your region&apos;s conventions.
                <br />• Affects all distance-based questions and measurements
                throughout the entire game
                <br />
                <br />
                <strong>Automation:</strong>
                <br />• <strong>Auto-save:</strong> Continuous saving vs manual
                save control. When disabled, you&apos;ll see &ldquo;Save&rdquo;
                buttons appear on question cards for manual control.{" "}
                <strong>
                    I highly recommend disabling this as I find that it makes
                    changing data easier.
                </strong>
                <br />• <strong>Planning Mode:</strong> Preview question effects
                before finalizing.{" "}
                <strong>
                    I highly recommend enabling this as it let&apos;s you see
                    all potential outcomes of a question, better improving your
                    strategy.
                </strong>
                <br />
                <br />
                <strong>API Integration:</strong>
                <br />• <strong>Thunderforest API Key:</strong> Enhanced map
                tiles
                <br />• <strong>Pastebin API Key:</strong> Improved sharing for
                large games
                <br />• <strong>Always Use Pastebin:</strong> Force external
                hosting for all shares. This is also useful if you want to
                generate a QR code containing the link, as this makes the QR
                code much less convoluted.
            </>
        ),
        targetSelector: '[data-tutorial-id="option-questions-button"]',
        position: "top",
    },
    {
        title: "Data Sources, Accuracy, and Limitations",
        content: (
            <>
                Understanding the underlying data sources helps set appropriate
                expectations:
                <br />
                <br />
                <strong>OpenStreetMap (OSM) Foundation:</strong>
                <br />• All geographic data comes from OpenStreetMap
                <br />• Community-driven mapping with varying completeness
                <br />• Generally excellent in urban areas, more sparse in rural
                regions
                <br />• Data quality depends on local mapping community activity
                <br />• Updated regularly but may lag behind real-world changes
                <br />
                <br />
                <strong>Administrative Boundaries:</strong>
                <br />• Official government boundaries imported from
                authoritative sources
                <br />• High accuracy for major administrative divisions
                <br />• Simplified to ±100 meters for browser performance
                <br />• Some disputed or changing boundaries may be outdated
                <br />
                <br />
                <strong>Transportation Data:</strong>
                <br />• Train stations: Good coverage in developed regions
                <br />• Commercial airports: Limited to those with IATA codes
                <br />• High-speed rail: Covers major systems (Shinkansen, TGV,
                etc.)
                <br />• Business data (McDonald&apos;s, 7-Eleven) depends on
                local mapping
                <br />
                <br />
                <strong>Points of Interest:</strong>
                <br />• Museums, hospitals, cinemas: Urban bias in coverage
                <br />• Theme parks, zoos: Major attractions well-represented
                <br />• Libraries, golf courses: Completeness varies by region
                <br />• Always verify critical locations for your specific area
                <br />
                <br />
                <strong>Coordinate Accuracy:</strong>
                <br />• Distance calculations use geodesic formulas
                <br />• Accounts for Earth&apos;s curvature and ellipsoid shape
                <br />• Typical accuracy within 1-2 meters for positioning
                <br />• Coastline data accuracy approximately ±100 meters
                <br />• Administrative boundary simplification may affect
                precision
                <br />
                <br />
                <strong>Performance Limitations:</strong>
                <br />• Large datasets may cause browser slowdowns
                <br />• Memory usage increases with game area size
                <br />• Complex polygons simplified for rendering performance
                <br />• API rate limits may affect real-time data loading
                <br />• Mobile devices have additional memory constraints
            </>
        ),
        position: "center",
    },
    {
        title: "You're Ready to Master Hide and Seek!",
        content: (
            <>
                Congratulations! You now have comprehensive knowledge of all 48+
                question variations and advanced features in this tool.
                <br />
                <br />
                <strong>Quick Start Checklist:</strong>
                <br />✓ Set up your game area using Place Picker or custom
                polygons
                <br />✓ Add and configure questions using the five main types
                <br />✓ Test your setup with Planning Mode if desired
                <br />✓ Configure options for optimal performance and experience
                <br />✓ Share the game link with all players using Share button
                <br />✓ Use Hider Mode for automatic question answering
                <br />✓ Analyze results
                <br />
                <br />
                <strong>Master the Five Question Types:</strong>
                <br />• <strong>Radius:</strong> Distance-based circles
                (inside/outside)
                <br />• <strong>Thermometer:</strong> Relative distance
                comparison (warmer/colder)
                <br />• <strong>Tentacles:</strong> Specific location
                identification by category
                <br />• <strong>Matching:</strong> Property comparison (same
                zone, nearest airport, etc...)
                <br />• <strong>Measuring:</strong> Distance comparison relative
                to seekers
                <br />
                <br />
                <strong>Need Help?</strong> This tutorial is always available
                via the Tutorial button. Feel free to{" "}
                <a
                    href="https://github.com/taibeled/JetLagHideAndSeek/issues"
                    className="text-blue-500 cursor-pointer"
                    target="_blank"
                    rel="noreferrer"
                >
                    report issues or request features on GitHub
                </a>
                . Your feedback helps improve the tool for everyone!
                <br />
                <br />
                <strong>Support the Project:</strong> If this tool enhances your
                Jet Lag games, please consider{" "}
                <a
                    href="https://github.com/taibeled/JetLagHideAndSeek"
                    className="text-blue-500 cursor-pointer"
                    target="_blank"
                    rel="noreferrer"
                >
                    leaving a GitHub star
                </a>{" "}
                and sharing with fellow fans. Every star helps motivate
                continued development! As of writing this, this project contains
                over 12,002 lines of code. At a liberal estimate of 50 lines per
                hour, us developers have collectively put over 240 hours into
                this project! Giving us a free star is a great way to show your
                appreciation for our work.
                <br />
                <br />
                Happy hiding and seeking!
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
