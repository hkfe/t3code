import {
  findSearchTokenRanges,
  foldSearchQuery,
  rankSearchItems,
  scoreSearchTerms,
  type SearchRange,
} from "@t3tools/shared/paletteSearch";
import { Atom } from "effect/reactivity";

import type { PaletteItem, PaletteSource } from "../../app/feature.ts";

const RECENT_LIMIT = 20;

/** Keys (`source:item`) of recent picks, newest first. Kept for this run of the app. */
export const recentPicksAtom = Atom.make<ReadonlyArray<string>>([]).pipe(Atom.keepAlive);

export function addRecentPick(recents: ReadonlyArray<string>, key: string): ReadonlyArray<string> {
  return [key, ...recents.filter((entry) => entry !== key)].slice(0, RECENT_LIMIT);
}

export interface PaletteGroup {
  readonly source: Pick<PaletteSource, "id" | "label" | "search">;
  readonly items: ReadonlyArray<PaletteItem>;
}

export interface PaletteRow {
  readonly key: string;
  readonly label: string;
  readonly item: PaletteItem;
  readonly titleRanges: ReadonlyArray<SearchRange>;
  readonly detailRanges: ReadonlyArray<SearchRange>;
}

/**
 * Without a query: every filtered row, recent picks first. With one: matching rows by the shared
 * web ranking, recent picks first among equal matches, then the search sources' own rows.
 */
export function rankPalette(
  groups: ReadonlyArray<PaletteGroup>,
  query: string,
  recents: ReadonlyArray<string>,
): ReadonlyArray<PaletteRow> {
  const normalized = foldSearchQuery(query);
  const recency = (key: string) => {
    const index = recents.indexOf(key);
    return index === -1 ? 0 : 1 / (index + 2);
  };
  const entries = groups.flatMap(({ source, items }) =>
    items.map((item) => ({ source, item, key: `${source.id}:${item.id}` })),
  );
  const filtered = entries.filter((entry) => !entry.source.search);
  const plain = (
    entry: (typeof entries)[number],
    titleRanges: ReadonlyArray<SearchRange> = [],
  ) => ({
    key: entry.key,
    label: entry.source.label,
    item: entry.item,
    titleRanges,
    detailRanges: [],
  });
  if (normalized === "") {
    return filtered
      .map((entry, order) => ({ entry, order, recency: recency(entry.key) }))
      .toSorted((a, b) => b.recency - a.recency || a.order - b.order)
      .map(({ entry }) => plain(entry));
  }
  const ranked = rankSearchItems(filtered, (entry, options) => {
    const match = scoreSearchTerms(
      normalized,
      [entry.item.title, ...(entry.item.keywords ?? [])],
      options,
    );
    return match && { ...match, score: match.score + recency(entry.key) };
  }).map(({ item, match }) => plain(item, match.ranges));
  const searched = entries
    .filter((entry) => entry.source.search)
    .map((entry) => ({
      ...plain(entry),
      detailRanges: findSearchTokenRanges(entry.item.detail ?? "", query),
    }));
  return [...ranked, ...searched];
}
