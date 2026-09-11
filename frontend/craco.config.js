const path = require("path");

module.exports = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  jest: {
    // `@hookform/resolvers/zod` hard-requires `zod/v4/core`, which zod ships as
    // untranspiled ESM. Webpack handles that; jest does not, so those two
    // packages must go through babel instead of being skipped with the rest of
    // node_modules. Craco *appends* an object-form `configure`, which would
    // leave CRA's catch-all node_modules pattern in place, so swap it out here.
    configure: (jestConfig) => ({
      ...jestConfig,
      // Mirror the webpack "@" alias so components under src/components/ui
      // resolve the same way under jest.
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
        // react-router-dom v7 points `main` at a file it no longer ships and
        // declares the real CJS entry only through an `exports` map, which the
        // jest 27 resolver bundled with react-scripts 5 does not read.
        "^react-router-dom$": "<rootDir>/node_modules/react-router-dom/dist/index.js",
        "^react-router/dom$": "<rootDir>/node_modules/react-router/dist/development/dom-export.js",
        ...(jestConfig.moduleNameMapper || {}),
      },
      transformIgnorePatterns: [
        "[/\\\\]node_modules[/\\\\](?!(zod|@hookform[/\\\\]resolvers)[/\\\\]).+\\.(js|jsx|mjs|cjs|ts|tsx)$",
        ...(jestConfig.transformIgnorePatterns || []).filter(
          (pattern) => !pattern.includes("node_modules")
        ),
      ],
    }),
  },
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    configure: (webpackConfig) => {
      webpackConfig.watchOptions = {
        ...webpackConfig.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/build/**",
          "**/dist/**",
          "**/coverage/**",
          "**/public/**",
        ],
      };
      return webpackConfig;
    },
  },
};
