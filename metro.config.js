const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

module.exports = config;
