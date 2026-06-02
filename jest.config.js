module.exports = {
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
    },
    modulePaths: ["<rootDir>/../node_modules"],
    preset: "jest-expo",
    setupFiles: ["./jest.setup.ts"],
    testMatch: ["**/__tests__/**/*.test.{ts,tsx}"],
    transformIgnorePatterns: [
        "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|@maplibre/.*|@gorhom/.*|react-navigation|@react-navigation/.*)",
    ],
    collectCoverageFrom: [
        "src/**/*.{ts,tsx}",
        "!src/**/*.d.ts",
        "!src/**/*Types.ts",
        "!src/**/types.ts",
        "!src/theme/**",
        "!src/config/**",
    ],
    coverageReporters: ["text", "lcov"],
};
