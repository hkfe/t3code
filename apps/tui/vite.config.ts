import "vite-plus/test/config";
import { defineConfig, mergeConfig } from "vite-plus";

import baseConfig from "../../vite.config.ts";

// Same split as apps/server: the root `projects` and workspace `run` config are invalid here.
const { projects: _rootTestProjects, ...baseTestConfig } = baseConfig.test ?? {};
const { run: _rootRunConfig, ...basePackageConfig } = baseConfig;

export default mergeConfig(
  { ...basePackageConfig, test: baseTestConfig },
  defineConfig({
    pack: {
      entry: ["src/bin.tsx"],
      outDir: "dist",
      sourcemap: true,
      inputOptions: { checks: { moduleLevelDirective: false } },
      clean: true,
      minify: true,
      // One self-contained file: `t3-tui` runs from a symlink without node_modules.
      // Optional native or dev-only peers stay out; their importers fall back without them.
      deps: {
        alwaysBundle: [/./],
        neverBundle: ["react-devtools-core", "bufferutil", "utf-8-validate"],
      },
      banner: { js: "#!/usr/bin/env node\n" },
    },
  }),
);
