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
      clean: true,
      // Workspace packages ship TypeScript sources, so they must be bundled.
      deps: { alwaysBundle: [/^@t3tools\//] },
      banner: { js: "#!/usr/bin/env node\n" },
    },
  }),
);
