import type { FileDiffMetadata } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";

import { useRenderedAppearance } from "../../hooks/useTheme";
import { resolveDiffThemeName, resolveFileDiffPath } from "../../lib/diffRendering";
import { PREFERRED_HIGHLIGHTER } from "../../lib/syntaxHighlighting";
import { DiffWorkerPoolProvider } from "../DiffWorkerPoolProvider";

export default function ReviewCommentDiff(props: { files: ReadonlyArray<FileDiffMetadata> }) {
  const renderedAppearance = useRenderedAppearance();
  return (
    <DiffWorkerPoolProvider>
      {props.files.map((fileDiff) => (
        <FileDiff
          key={resolveFileDiffPath(fileDiff)}
          fileDiff={fileDiff}
          options={{
            collapsed: false,
            diffStyle: "unified",
            theme: resolveDiffThemeName(renderedAppearance),
            preferredHighlighter: PREFERRED_HIGHLIGHTER,
          }}
        />
      ))}
    </DiffWorkerPoolProvider>
  );
}
