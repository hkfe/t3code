# Building TUI features

This is the contract for feature work on `apps/tui`. Many threads build features in parallel. If you
follow this page, your change touches your own folder plus one line in `src/features/index.ts`, and
it does not conflict with other threads.

Read the repo's `AGENTS.md` first. Everything there applies here.

## Layout

```
apps/tui/src/
  bin.tsx                 CLI entry: args, `pair`, render(<App/>). Rarely changes.
  app/                    The shell. Shared: change only for a cross-feature need.
    App.tsx               Regions (sidebar, main, panel), overlay slot, status bar, resize.
    feature.ts            The TuiFeature contract (types only).
    registry.ts           Merges features; throws on duplicate ids or unknown commands.
    input.tsx             KeyRouter and useRegionInput.
    keys.ts               isKey(press, "ctrl+k"): web keybinding syntax on Ink key events.
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
     keybindings: [{ key: "ctrl+p", command: "pr-panel.open", when: ({ overlay }) => overlay === null }],
     panels: [{ id: "pr-panel", title: "Pull request", component: PrPanel }],
   };
   ```

2. Add it to the array in `src/features/index.ts`. Order matters only for keybinding ties: the
   first matching binding wins.

What a feature can add (all optional, see `app/feature.ts`):

| Field         | Where it shows                                    | Selected by                     |
| ------------- | ------------------------------------------------- | ------------------------------- |
| `sidebar`     | Left region body. Only one feature may set it.    | always                          |
| `views`       | Main region.                                      | `routeAtom.view`                |
| `panels`      | Right region, with a title line.                  | `layoutAtom.panel` (null = off) |
| `overlays`    | Replaces the regions; status bar stays.           | `overlayAtom` (null = off)      |
| `statusItems` | Status bar, `align: "left"` or `"right"`.         | always                          |
| `commands`    | Run by keybindings; later by the command palette. | id                              |
| `keybindings` | Global keys.                                      | key + `when`                    |

View, panel and overlay components get `{ focused, width, height }`: the inner size in cells. Render
inside that box. For long lists, render only the rows that fit (see `features/sidebar/Sidebar.tsx`).

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
- The registry throws at startup on duplicate command, view, panel, overlay or feature ids, and on a
  keybinding that names an unknown command. The App render test catches this.

## Keys

Key strings use the web syntax, parsed by `@t3tools/shared/keybindings`: `ctrl+k`, `shift+tab`,
`alt+arrowleft`, `enter`, `escape`, `?`, `j`. `mod` means ctrl, because terminals have no Cmd key.
`alt` is Option/Meta; on macOS terminals it works only with "Use Option as Meta" on. Prefer `ctrl`
and plain keys for defaults. Many `ctrl+shift+x` combos are not sent by terminals.

Order of a key press (`app/input.tsx`):

1. The overlay handler, if an overlay is open.
2. The handler of the focused region, if it registered with `{ first: true }`.
3. Global keybindings (first match whose `when` passes).
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

- One handler per target (`"sidebar" | "main" | "panel" | "overlay"`). The mounted view owns its
  region. Do not use Ink's `useInput` in features: it bypasses focus and the global bindings.
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

- Colors come from `theme` (`theme.accent`, `theme.textMuted`, `theme.label[color]` for thread
  labels, `theme.syntax.*` for code and diffs). Add a token there when you need a new role.
- No timers that repaint all the time (spinners on every frame, clocks). A changed atom repaints;
  that is enough. A streaming message already repaints as text arrives.
- Truncate single-line text with `wrap="truncate"`, so it does not break the layout.

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

`$P/screen.txt` holds the raw ANSI output (`\x11` is ctrl+q, which quits).
