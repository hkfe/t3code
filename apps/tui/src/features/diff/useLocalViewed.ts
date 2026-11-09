import { useAtom } from "@effect/atom-react";

import type { ViewedFiles } from "./CodeBrowser.tsx";
import { localViewedAtom } from "./state.ts";

export function useLocalViewed(scope: string): ViewedFiles {
  const [paths, setPaths] = useAtom(localViewedAtom(scope));
  return {
    isViewed: (path) => paths.has(path),
    setViewed: (path, viewed) => {
      const next = new Set(paths);
      if (viewed) next.add(path);
      else next.delete(path);
      setPaths(next);
    },
  };
}
