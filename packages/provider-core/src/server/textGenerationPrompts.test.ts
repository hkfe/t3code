import { describe, expect, it } from "vite-plus/test";

import * as Schema from "effect/Schema";

import { buildThreadTitlePrompt, pickThreadLabels } from "./textGenerationPrompts.ts";
import { normalizeCliError } from "./textGenerationUtils.ts";

describe("normalizeCliError", () => {
  it("does not expose CLI failure details in the public error message", () => {
    const result = normalizeCliError(
      "codex",
      "generateCommitMessage",
      new Error("request failed with access_token=secret-token"),
      "Failed to generate a commit message",
    );

    expect(result.detail).toBe("Failed to generate a commit message");
    expect(result.message).not.toContain("secret-token");
  });
});

describe("thread title labels", () => {
  const labels = [
    { id: "bug", name: "bug", color: "red" as const },
    { id: "label-1a2b", name: "Mobile", color: "blue" as const },
  ];
  const decode = (
    schema: ReturnType<typeof buildThreadTitlePrompt>["outputSchema"],
    json: string,
  ): object => Schema.decodeSync(Schema.fromJsonString(schema))(json);

  it("asks for labels only when some are offered", () => {
    const plain = buildThreadTitlePrompt({ message: "Fix crash", labels: [] });
    expect(plain.prompt).not.toContain("Labels (id: name)");
    expect(decode(plain.outputSchema, '{"title":"Fix crash","labels":["bug"]}')).not.toHaveProperty(
      "labels",
    );
    const { prompt, outputSchema } = buildThreadTitlePrompt({ message: "Fix crash", labels });
    expect(prompt).toContain('- "label-1a2b": "Mobile"');
    expect(decode(outputSchema, '{"title":"Fix crash","labels":["bug"]}')).toEqual({
      title: "Fix crash",
      needsRefinement: false,
      labels: ["bug"],
    });
  });

  it("keeps the title when the labels value is bad or missing", () => {
    const { outputSchema } = buildThreadTitlePrompt({ message: "Fix crash", labels });
    for (const json of ['{"title":"Fix crash","labels":"bug"}', '{"title":"Fix crash"}']) {
      expect(decode(outputSchema, json)).toMatchObject({ title: "Fix crash", labels: [] });
    }
  });

  it.each([
    { picked: ["bug", "mobile"], expected: ["bug", "label-1a2b"] },
    { picked: ["bug", "unknown", "BUG"], expected: ["bug"] },
    { picked: ["bug", "label-1a2b", "bug", "x"], expected: ["bug", "label-1a2b"] },
    { picked: [], expected: [] },
  ])("picks offered labels from $picked", ({ picked, expected }) => {
    expect(pickThreadLabels(picked, labels)).toEqual(expected);
  });

  it("caps picks at 3", () => {
    const many = ["a", "b", "c", "d"].map((id) => ({ id, name: id, color: "gray" as const }));
    expect(pickThreadLabels(["a", "b", "c", "d"], many)).toEqual(["a", "b", "c"]);
  });
});
