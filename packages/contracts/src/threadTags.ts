import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/** Tags match by exact spelling and case after trimming. */
export const ThreadTag = TrimmedNonEmptyString.check(
  Schema.isMaxLength(64),
  Schema.makeFilter((value) =>
    /[\p{Cc}]/u.test(value) ? "A thread tag must be a single line of text." : true,
  ),
);
export type ThreadTag = typeof ThreadTag.Type;

/** Tags read back from storage or a peer. Lenient so a later tag rule never fails a whole thread. */
export const StoredThreadTags = Schema.Array(Schema.String).pipe(
  Schema.catchDecoding(() => Effect.succeedSome([])),
);

export const THREAD_LABEL_COLORS = [
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;
export const ThreadLabelColor = Schema.Literals(THREAD_LABEL_COLORS);
export type ThreadLabelColor = typeof ThreadLabelColor.Type;

/** A label is a thread tag whose value is its `id`, so renaming keeps it on threads. */
export const ThreadLabel = Schema.Struct({
  id: ThreadTag,
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(32)),
  color: ThreadLabelColor,
});
export type ThreadLabel = typeof ThreadLabel.Type;

export const MAX_THREAD_LABELS = 32;

const isThreadLabel = Schema.is(ThreadLabel);

/** Bad or repeated entries drop alone, so a hand edit cannot reset settings. */
export const ThreadLabels = Schema.Array(Schema.Unknown).pipe(
  Schema.decodeTo(
    Schema.Array(ThreadLabel),
    SchemaTransformation.transform<ReadonlyArray<ThreadLabel>, ReadonlyArray<unknown>>({
      decode: (values) =>
        values
          .filter(isThreadLabel)
          .filter((label, index, all) => all.findIndex((other) => other.id === label.id) === index)
          .slice(0, MAX_THREAD_LABELS),
      encode: (values) => values,
    }),
  ),
);

export const DEFAULT_THREAD_LABELS: ReadonlyArray<ThreadLabel> = [
  { id: "bug", name: "bug", color: "red" },
  { id: "feature", name: "feature", color: "green" },
  { id: "perf", name: "perf", color: "orange" },
  { id: "ui", name: "ui", color: "pink" },
  { id: "refactor", name: "refactor", color: "violet" },
  { id: "docs", name: "docs", color: "blue" },
  { id: "review", name: "review", color: "teal" },
  { id: "blocked", name: "blocked", color: "gray" },
];

/** A thread's labels in settings order. Tags without a label (deleted ones too) are skipped. */
export function threadLabelsOf(
  tags: ReadonlyArray<string> | undefined,
  labels: ReadonlyArray<ThreadLabel> | undefined,
): ReadonlyArray<ThreadLabel> {
  if (!tags?.length || !labels?.length) return [];
  return labels.filter((label) => tags.includes(label.id));
}
