import { MAX_THREAD_LABELS, type ThreadLabel } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  addLabel,
  labelUsage,
  moveLabel,
  recolorLabel,
  reduceLabels,
  renameLabel,
  type LabelEditor,
} from "./labels.ts";

const labels: ReadonlyArray<ThreadLabel> = [
  { id: "bug", name: "bug", color: "red" },
  { id: "feature", name: "feature", color: "pink" },
];

describe("label edits", () => {
  it("moves within bounds only", () => {
    expect(moveLabel(labels, 0, 1).map((label) => label.id)).toEqual(["feature", "bug"]);
    expect(moveLabel(labels, 0, -1)).toBe(labels);
    expect(moveLabel(labels, 1, 1)).toBe(labels);
  });

  it("keeps the old name for a blank rename and trims to 32 characters", () => {
    expect(renameLabel(labels, 0, "   ")).toBe(labels);
    expect(renameLabel(labels, 0, ` ${"x".repeat(40)} `)[0]!.name).toBe("x".repeat(32));
  });

  it("wraps colors around the palette", () => {
    expect(recolorLabel(labels, 1, 1)[1]!.color).toBe("gray");
    expect(recolorLabel(labels, 1, -1)[1]!.color).toBe("violet");
  });

  it("stops adding at the label limit", () => {
    const full = Array.from({ length: MAX_THREAD_LABELS }, (_, index) => ({
      ...labels[0]!,
      id: `l${index}`,
    }));
    expect(addLabel(full, "extra")).toBe(full);
    expect(addLabel(labels, "new").at(-1)).toMatchObject({ id: "new", name: "new label" });
  });

  it("counts threads per label", () => {
    const usage = labelUsage([{ tags: ["bug"] }, { tags: ["bug", "feature"] }, {}]);
    expect(usage.get("bug")).toBe(2);
    expect(usage.get("feature")).toBe(1);
  });
});

describe("reduceLabels", () => {
  const start: LabelEditor = { draft: null, cursor: 0, mode: { kind: "list" } };
  const three: ReadonlyArray<ThreadLabel> = [
    ...labels,
    { id: "perf", name: "perf", color: "teal" },
  ];

  it("builds each edit on the unconfirmed draft, not on the saved list", () => {
    // Two reorders before the server echoes the first move the label two rows down.
    const once = reduceLabels(start, three, { type: "reorder", by: 1 });
    const twice = reduceLabels(once, three, { type: "reorder", by: 1 });
    expect(twice.draft?.map((label) => label.id)).toEqual(["feature", "perf", "bug"]);
    expect(twice.cursor).toBe(2);
    const recolored = reduceLabels(twice, three, { type: "recolor", by: 1 });
    expect(recolored.draft?.map((label) => [label.id, label.color])).toEqual([
      ["feature", "pink"],
      ["perf", "teal"],
      ["bug", "orange"],
    ]);
  });

  it("keeps the draft untouched for a no-op edit", () => {
    expect(reduceLabels(start, three, { type: "reorder", by: -1 }).draft).toBeNull();
  });

  it("renames and deletes the label under the cursor only after the second step", () => {
    const typing = reduceLabels(start, three, { type: "rename", value: "defect" });
    expect(typing.draft).toBeNull();
    expect(reduceLabels(typing, three, { type: "commitRename" }).draft?.[0]?.name).toBe("defect");
    const asking = reduceLabels({ ...start, cursor: 2 }, three, { type: "askDelete", uses: 3 });
    expect(reduceLabels(asking, three, { type: "cancel" }).draft).toBeNull();
    const deleted = reduceLabels(asking, three, { type: "confirmDelete" });
    expect(deleted.draft?.map((label) => label.id)).toEqual(["bug", "feature"]);
    expect(deleted.cursor).toBe(1);
  });
});
