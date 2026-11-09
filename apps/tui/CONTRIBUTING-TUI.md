# Building TUI features

This is the contract for feature work on `apps/tui`. Many threads build features in parallel. If you
follow this page, your change touches your own folder plus one line in `src/features/index.ts`, and
it does not conflict with other threads.

Read the repo's `AGENTS.md` first. Everything there applies here.

## Layout

```
apps/tui/src/
  bin.tsx                 CLI entry: parses args (cli.ts), then loads run.tsx. Rarely changes.
  run.tsx                 Pairs, renders <App/>, restores the terminal on exit and signals.
  app/                    The shell. Shared: change only for a cross-feature need.
    App.tsx               Regions (sidebar, main, panel), overlay slot, status bar, resize.
    feature.ts            The TuiFeature contract (types only).
    registry.ts           Merges features; throws on duplicate ids or unknown commands.
    input.tsx             KeyRouter and useRegionInput.
    keys.ts               isKey(press, "ctrl+k"): web keybinding syntax on Ink key events.
    keymap.ts             Help rows and the leader popup, from the registry.
  connection/             Effect layers for Node: catalog file, capabilities, atom runtime.
  state/                  Shared atoms, one file per topic (catalog, shell, threads, settings, ui...).
  theme/theme.ts          The warm palette. Use it; do not write hex colors in features.
  features/
    index.ts              The feature list. Add one line here.
    core/                 Focus, layout, quit, help panel.
    connection/           Status bar connection state, pairing screen ("home" view).
    sidebar/              Sidebar: sections, project folders, labels, filter.
    thread-view/          Read-only messages ("thread" view). Wave 1 replaces it.
    <your-feature>/       index.ts exports `<name>Feature: TuiFeature`, plus its components.
```

## Add a feature

1. Make `src/features/<name>/index.ts` (`.tsx` if it has JSX) and export a `TuiFeature`:

   ```ts
   export const prPanelFeature: TuiFeature = {
     id: "pr-panel",
     commands: [{ id: "pr-panel.open", title: "Open PR panel", run: ({ registry }) => ... }],
     keybindings: [{ key: "leader p", command: "pr-panel.open", when: ({ overlay }) => overlay === null }],
     panels: [{ id: "pr-panel", title: "Pull request", component: PrPanel }],
   };
   ```

2. Add it to the array in `src/features/index.ts`. Order matters only for keybinding ties: the
   first matching binding wins.

What a feature can add (all optional, see `app/feature.ts`):

| Field            | Where it shows                                        | Selected by                     |
| ---------------- | ----------------------------------------------------- | ------------------------------- |
| `sidebar`        | Left region body. Only one feature may set it.        | always                          |
| `views`          | Main region.                                          | `routeAtom.view`                |
| `footers`        | Under a main view, same frame (the composer).         | its `view` id                   |
| `panels`         | Right region, with a title line.                      | `layoutAtom.panel` (null = off) |
| `overlays`       | Replaces the regions; status bar stays.               | `overlayAtom` (null = off)      |
| `statusItems`    | Status bar, `align: "left"` or `"right"`.             | always                          |
| `commands`       | Run by keybindings and listed in the command palette. | id                              |
| `keybindings`    | Global or leader keys; the palette shows the first.   | key + `when`                    |
| `paletteSources` | More command palette rows (threads, projects...).     | the palette's query             |
| `prPanelTabs`    | A tab of the pull request panel (see below).          | the panel's tab bar             |

A `PaletteSource` returns rows from atoms through `get`; the palette filters, ranks and highlights
them. Recent picks come first. Set `search: true` when the source matches the query itself (as the
server message search does): it then gets the typed query, debounced, and its rows show unfiltered.
Item ids must be unique within the source.

### Pull request panel tabs

`features/pr-panel` owns the right panel `pr-panel` (leader `p`) for the current thread's linked
pull requests. It draws the PR line and the tab bar; each tab is a `prPanelTabs` contribution:

```ts
prPanelTabs: [{ id: "code", title: "Code", order: 40, component: CodeTab }];
```

- `order` sorts the tabs: Summary 10, Timeline 20, Checks 30, Code 40.
- The component gets `{ target, focused, width, height }`. `target` is
  `{ environmentId, reference: PullRequestRef }` of the selected PR; `height` excludes the panel's
  two header lines.
- Only the active tab is mounted, keyed by tab and PR. Its `useRegionInput("panel", ...)` sees
  keys before the panel. The panel uses `[` / `]` and `1`-`9` (tabs), `n` (next linked PR) and
  `r` (refresh); return `false` for them unless the tab needs one in a state the panel does not.
- Read PR data from `pullRequestAtoms` in `state/pullRequests.ts` (detail, activity, checks,
  `checkLog`, `diff`). Do not create a second `createPullRequestEnvironmentAtoms`.

View, footer, panel and overlay components get `{ focused, width, height }`: the inner size in
cells. A view gets the rows its footers leave. Render inside that box. For long lists, render only
the rows that fit (see `features/sidebar/Sidebar.tsx`).

Main views and footers can render more than once: with split panes (`state/panes.ts`) each pane
is a frame of its own. Read the pane's thread with `usePaneRoute()`, not `routeAtom`, and keep
per-view state in the component or in atoms keyed by thread. Only the active pane gets
`focused: true` and `useRegionInput("main", ...)` keys. `routeAtom` is always the active pane's
route, so commands that read it act on the focused pane.

Replacing a wave-0 module (sidebar, thread view): edit that feature's folder, or remove its line
from `features/index.ts` and add yours. Keep the view ids `home` and `thread`, because the router
and other features use them.

## Commands and ids

- When the web app has the same action, use its id from `KeybindingCommand` in
  `packages/contracts/src/keybindings.ts` (`commandPalette.toggle`, `thread.next`, `chat.new`,
  `rightPanel.toggle`, `modelPicker.toggle`...). Then the palette and later user keybindings line up
  with web.
- Otherwise prefix the id with your feature id: `pr-panel.refresh`.
- `run` gets `{ registry, exit }`. Change UI state with `registry.set(atom, value)`. Start server work
  with `runAtomCommand(registry, command, input)` (see "Write state" below).
- The registry throws at startup on duplicate command, view, panel, overlay or feature ids, on a
  keybinding that names an unknown command, and on a key that does not parse. The App render test
  catches this.

## Keys

Key strings use the web syntax, parsed by `@t3tools/shared/keybindings`: `ctrl+k`, `shift+tab`,
`alt+arrowleft`, `enter`, `escape`, `?`, `j`, `f1`-`f12`. `mod` means ctrl, because terminals have
no Cmd key. `alt` is Option/Meta; on macOS terminals it works only with "Use Option as Meta" on.
Many `ctrl+shift+x` combos are not sent by terminals.

Free direct keys are few. Give a new global action a **leader binding** unless users press it all
the time:

```ts
keybindings: [{ key: "leader p", command: "pr-panel.toggle", when: ({ overlay }) => overlay === null }],
```

`leader p` runs after the leader key (`ctrl+space`, user-configurable). The which-key popup and `?`
list it under your feature id, with the command title, so make the title short and clear. Pick a
letter that is free in the leader map (`?` shows it). Direct `ctrl+` keys are for actions used many
times a session (palette, new thread, switcher); ask before you take one. Keep web command ids, so
users can rebind with the same ids as on web.

Two bindings on one key with `when`s that can both pass are a collision: the first wins and the
second never runs. `app/registry.test.ts` fails on any collision among the shipped features, and at
runtime the status bar shows collisions that user overrides cause.

Order of a key press (`app/input.tsx`):

1. The overlay handler, if an overlay is open.
2. The handler of the focused region, if it registered with `{ first: true }`.
3. Global keybindings (first match whose `when` passes). After the leader key, the next key goes
   only to leader bindings, before step 1; a key with no leader binding cancels.
4. The handler of the focused region, if it did not use `first`.

A handler returns `true` when it used the key; this stops the order. Region handlers:

```tsx
useRegionInput("main", (press) => {
  if (isKey(press, "j")) {
    move(1);
    return true;
  }
  return false;
});
```

- The mounted view owns its region (`"sidebar" | "main" | "panel" | "overlay"`). A view footer
  shares `"main"` with its view; handlers run in mount order until one returns true. Do not use
  Ink's `useInput` in features: it bypasses focus and the global bindings.
- Text fields (composer, palette query) use `{ first: true }` and return `false` for keys they
  leave to the global bindings (`ctrl+...`, `escape`, `tab`). Overlays must return `false` for
  `escape`, so `core.closeOverlay` closes them.
- Plain-key global bindings (`?`, `tab`) need `when: ({ overlay }) => overlay === null`.
- Pasted text arrives through Ink's `usePaste`, not through the key handlers.

## Read state

All server data comes from `@t3tools/client-runtime` atoms, made once per app in `src/state/`:

| Module               | Atoms                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `state/catalog`      | `environmentCatalog.catalogValueAtom` (paired servers), `.stateAtom(environmentId)` (connection phase), `connectPairingUrl`    |
| `state/shell`        | `environmentShell.stateValueAtom(environmentId)`: projects and thread shells (title, status, `workingPhase`, tags...)          |
| `state/threads`      | `environmentThreadDetails.*(ref)`: `threadAtom`, `visibleTurnItemsAtom`, `pendingRequestsAtom`, `statusAtom`, `historyAtom`... |
| `state/settings`     | `serverEnvironment.settingsValueAtom(environmentId)`: server settings (`threadLabels`...), server config                       |
| `state/threadShells` | `environmentThreadShells.quietThreadShellsAtom`: presented thread shells of every environment, as web lists them               |
| `state/ui`           | `routeAtom`, `focusAtom`, `overlayAtom`, `layoutAtom` (TUI view state, plain writable atoms)                                   |
| `state/panes`        | `panesAtom` (split panes), `usePaneRoute()` (the route of the pane a main view renders in)                                     |

`state/composer` exports `composerReplyTargetAtom`: the message the next send quotes. Set it to
reply; the composer shows the quote chip and clears it after the send.

Read them in components with `useAtomValue` from `@effect/atom-react`. Reading a thread atom starts
its live subscription, and unmounting releases it. Do not copy server data into React state.

Need more client-runtime atoms (thread families for the
Working/Waiting groups, sessions, PR state)? Copy the wiring from the mobile app
(`apps/mobile/src/state/*.ts`), which uses the same factories. Put it in a **new** file
`src/state/<topic>.ts` built on `connectionAtomRuntime` from `src/connection/runtime.ts`, so threads
do not edit the same file. Feature-only derived atoms stay in the feature folder (see
`projectsAtom` in `features/sidebar/Sidebar.tsx`). The runtime layer (`connection/runtime.ts`) gives
the connection registry, shell and thread snapshot loaders, and a no-op offline cache. If a factory
needs another service (for example `PullRequestDiffLoader.layer`), add it to
`layerSnapshotLoaders` there.

Logic that web and mobile also need belongs in `packages/client-runtime`, not here.

## Write state

- Client mutations use `createEnvironmentRpcCommand` from client-runtime, as on web and mobile
  (`AGENTS.md` › Taste). The server checks permissions; the command's `permissionAtom` tells the UI
  if the action is available.
- Run a command from a handler with `runAtomCommand(registry, command, input)` from
  `@t3tools/client-runtime/state/runtime`. Get `registry` from `useContext(RegistryContext)` or
  from the `CommandContext`.

## Look

The TUI must read as one app. Check a visual change at 80x24, 120x40 and 200x60, on a dark and a
light background (see "Run against a playground server" for headless captures).

**Color.** Colors come from `theme` in `theme/theme.ts`; never write a color in a feature.

- `text` is content, `textMuted` secondary content (titles, section headers), `textFaint` hints,
  timestamps and empty states. `accent` marks focus, the open item and key hints in lists.
  `success`, `warning`, `danger` and `info` carry meaning only. `""` means the terminal's default.
- The theme picks one of four palettes at startup: dark or light (`T3_TUI_THEME`, else the
  terminal's answer to an OSC 11 query, else `COLORFGBG`), rich (256 colors or more) or ANSI 16
  (`COLORTERM`, `TERM`, `FORCE_COLOR`). `NO_COLOR` removes every color and shows backgrounds as
  reverse video. A new token needs a value in `dark`, `light` and `ansi16`.

**Frames.** Every boxed surface is a `Frame` from `app/Frame.tsx`: round border, 1 column of
padding, the title in the top edge and key hints in the bottom edge. The focused frame has an accent
border and title (a heavy border without color). Overlays are a full-size `Frame` (settings, switcher, overview) or a centered
`Modal` (palette, model picker, dialogs). A Frame takes `FRAME_X` columns and `FRAME_Y` rows; size
the content from those. Cards inside a frame (switcher, overview) use a plain round border, accent
when selected.

**Headers.** The frame title is the header: no title line inside a frame. A view that names its
content (the thread view) shows one bold `textMuted` line on top. Counts and details follow the
title in `textFaint`. Section headers in lists are bold `textMuted`.

**Spacing.** One blank line between sections or message blocks, never two. Inline parts are
separated by `" · "` in `textFaint`; status bar groups by 2 spaces. Key hints are lowercase,
`key action`, joined by `" · "`: `enter open · esc close`.

**Selection.** The selected row gets `backgroundColor: theme.selection` (reverse video without
color); the open or current item uses `accent` text. A list with a cursor may add an accent `▌`.

**Truncation.** No text may wrap where a line is meant:

- Single-line text gets `wrap="truncate"` (it ends in `…`). Fixed columns are a `Box` with `width`
  and `flexShrink={0}`; the flexible column gets `flexGrow={1} flexShrink={1} minWidth={0}`.
- Measure with `string-width`, never `.length`: CJK and most emoji take 2 cells. Expand tabs to 2
  spaces (`thread-view/lines.ts`, `diff/patch.ts`); a terminal moves a tab to the next tab stop.
- The status bar gives way from the lowest priority: key hints, then left items, then right items.
  Put the state before the name (`● Connected · laptop`), so a cut keeps the state.

**States.** Empty, loading and error states are one line in the space the content would take.
Empty and loading are `textFaint` ("No matches.", "Loading pull request…"); errors are `danger`
and name the retry key ("Could not load the checks. r retries."). Sentence case, ending in a period
or an ellipsis.

**Glyphs.** Use the shared set: `●` status or unread, `○` pending, `✓` `✗` results, `▸` `▾`
folds, `▌` cursor row, `›` prompt, `↳` reply, `·` separator, `…` ellipsis, `─` `│` rules. No emoji
in chrome: terminals disagree on their width. Without a UTF-8 locale (or with `T3_TUI_ASCII=1`)
`theme/output.ts` folds output to ASCII of the same width; add a new glyph to its map, or it shows
as `?`.

**Motion.** No timers that repaint all the time (spinners on every frame, clocks). A changed atom
repaints; that is enough. A streaming message already repaints as text arrives.

## Test

`vp test run apps/tui/src/<file>` runs tests with `vite-plus/test` (Vitest).

- Logic (selectors, sorting, grouping, key maps) gets plain unit tests beside the module, as
  `features/sidebar/sidebarModel.test.ts` and `app/keys.test.ts` do.
- Effect services get `it.effect` tests from `@effect/vitest`, as `connection/storage.test.ts` does.
- A component that has behavior (keys, focus, state changes) can render with
  `render(...)` from `ink-testing-library`, then `stdin.write(...)` and
  `await vi.waitFor(() => expect(lastFrame()).toContain(...))`. Unmount in `finally`. See
  `app/App.test.tsx`. Point `T3_TUI_CONFIG_DIR` at a directory that does not exist, so no test
  reads a real session.
- Follow the test rules in `AGENTS.md`: no sleeps, no polling loops, no tests for static markup.

## Run against a playground server

Never start a server on a copy of `~/.t3/userdata`. Use playground data:

```sh
P=/tmp/<your-thread>-play; mkdir -p $P/userdata
sqlite3 ~/t3-playground/userdata/statev2.sqlite ".backup $P/userdata/statev2.sqlite"
cp ~/t3-playground/userdata/{environment-id,anonymous-id,settings.json} $P/userdata/
# Set every entry of "providerInstances" in $P/userdata/settings.json to "enabled": false.
# Do not copy server-runtime.json, logs, secrets or clerk.

cd apps/server
T3CODE_NO_BROWSER=1 node src/bin.ts serve --base-dir $P --port 46xx --host 127.0.0.1 --no-browser \
  > $P/server.log 2>&1 &
echo $! > $P/server.pid          # stop it later with: kill "$(cat $P/server.pid)"
grep 'Pairing URL' $P/server.log
```

Then run the TUI with its own config dir, so your session does not mix with others:

```sh
vp run --filter @t3tools/tui build
T3_TUI_CONFIG_DIR=$P/tui node apps/tui/dist/bin.mjs pair '<pairing URL>'
```

To capture the screen without a window, run it under `script` and feed keys on stdin:

```sh
(sleep 5; printf '\t'; sleep 1; printf '\x11') | T3_TUI_CONFIG_DIR=$P/tui \
  script -q $P/screen.txt env COLUMNS=120 LINES=32 node apps/tui/dist/bin.mjs
```

`$P/screen.txt` holds the raw ANSI output (`\x11` is ctrl+q, which quits). To check the theme
fallbacks, set `COLORTERM=truecolor`, `TERM=xterm-256color`, `TERM=xterm` (16 colors), `NO_COLOR=1`,
`T3_TUI_THEME=light` or `LANG=C` (ASCII) in the `env` part.
