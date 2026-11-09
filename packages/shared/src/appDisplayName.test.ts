import { expect, it } from "vite-plus/test";

import { formatAppDisplayName } from "./appDisplayName.ts";

it("formats the fork name with the build commit hash", () => {
  expect(formatAppDisplayName("abc1234")).toBe("T3-Code (helios - abc1234)");
});
