/// <reference types="jest" />

const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
    if (
        typeof args[0] === "string" &&
        args[0].includes("was not wrapped in act(...)")
    ) {
        return;
    }
    originalConsoleError(...args);
};

jest.mock("expo-location", () => ({
    Accuracy: {
        Balanced: 3,
    },
    getCurrentPositionAsync: jest.fn().mockResolvedValue({
        coords: { latitude: 35.6762, longitude: 139.6503 },
        timestamp: Date.now(),
    }),
    requestForegroundPermissionsAsync: jest
        .fn()
        .mockResolvedValue({ status: "granted" }),
}));

jest.mock("expo-router", () => ({
    Link: ({ children }: { children: React.ReactNode }) => children,
    Stack: ({ children }: { children?: React.ReactNode }) => children,
    useLocalSearchParams: jest.fn(() => ({})),
    useRouter: jest.fn(() => ({
        replace: jest.fn(),
    })),
}));

jest.mock("@react-native-async-storage/async-storage", () => {
    let store = {};
    return {
        __esModule: true,
        default: {
            clear: jest.fn(() => {
                store = {};
                return Promise.resolve();
            }),
            getItem: jest.fn((key) => Promise.resolve(store[key] ?? null)),
            removeItem: jest.fn((key) => {
                delete store[key];
                return Promise.resolve();
            }),
            setItem: jest.fn((key, value) => {
                store[key] = value;
                return Promise.resolve();
            }),
        },
    };
});

jest.mock("@maplibre/maplibre-react-native", () => {
    const React = require("react");
    const { View } = require("react-native");

    const cameraMethods = {
        fitBounds: jest.fn(),
        setCamera: jest.fn(),
    };

    const createMapComponent =
        (testID) =>
        ({ children, testID: providedTestID, ...props }) =>
            React.createElement(
                View,
                { ...props, testID: providedTestID ?? testID },
                children,
            );

    const Camera = React.forwardRef(({ children, ...props }, ref) => {
        React.useImperativeHandle(ref, () => cameraMethods);
        return React.createElement(
            View,
            { ...props, testID: "map-camera" },
            children,
        );
    });

    return {
        Camera,
        CircleLayer: createMapComponent("map-circle-layer"),
        FillLayer: createMapComponent("map-fill-layer"),
        LineLayer: createMapComponent("map-line-layer"),
        MapView: createMapComponent("map-view"),
        ShapeSource: createMapComponent("map-shape-source"),
        UserLocation: createMapComponent("map-user-location"),
        __cameraMethods: cameraMethods,
        setAccessToken: jest.fn(),
    };
});

jest.mock("react-native-reanimated", () => {
    const { View } = require("react-native");
    const noopFn = () => {};
    const noopAnimation = { start: noopFn, stop: noopFn };
    const createAnimation = () => noopAnimation;

    return {
        __esModule: true,
        default: {
            View,
            Text: View,
            Image: View,
            ScrollView: View,
            createAnimatedComponent: (c) => c,
            addWhitelistedUIProps: noopFn,
        },
        useSharedValue: (init) => ({ value: init }),
        useDerivedValue: (fn) => ({ value: fn() }),
        useAnimatedProps: noopFn,
        useAnimatedStyle: () => ({}),
        useEvent: () => noopFn,
        useHandler: noopFn,
        withTiming: () => 0,
        withSpring: () => 0,
        withRepeat: () => 0,
        withSequence: () => 0,
        withDelay: () => 0,
        cancelAnimation: noopFn,
        runOnJS: (fn) => fn,
        runOnUI: (fn) => fn,
        SlideInLeft: createAnimation,
        SlideInRight: createAnimation,
        SlideOutLeft: createAnimation,
        SlideOutRight: createAnimation,
        FadeIn: createAnimation,
        FadeOut: createAnimation,
    };
});

jest.mock("react-native-gesture-handler", () => {
    const RNGH = jest.requireActual("react-native-gesture-handler");
    return {
        ...RNGH,
        GestureDetector: ({ children }: { children: React.ReactNode }) =>
            children,
        Gesture: {
            Pan: () => ({
                activeOffsetX: () => ({
                    onEnd: () => {},
                }),
            }),
        },
    };
});

jest.mock("@gorhom/bottom-sheet", () => {
    const React = require("react");
    const { View } = require("react-native");

    const bottomSheetMethods = {
        snapToIndex: jest.fn(),
    };

    const BottomSheet = React.forwardRef(({ children, ...props }, ref) => {
        React.useImperativeHandle(ref, () => bottomSheetMethods);
        return React.createElement(
            View,
            { ...props, ref, testID: "bottom-sheet" },
            children,
        );
    });

    return {
        __esModule: true,
        BottomSheetView: ({ children, ...props }) =>
            React.createElement(
                View,
                { ...props, testID: "bottom-sheet-view" },
                children,
            ),
        default: BottomSheet,
        __bottomSheetMethods: bottomSheetMethods,
    };
});

jest.mock("qrcode/lib/core/qrcode", () => ({
    create: () => ({
        modules: {
            data: [true, false, true, false],
            size: 2,
        },
    }),
}));
