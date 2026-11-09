# T3 Code TUI

A terminal client for T3 Code, built with [Ink](https://github.com/vadimdemedes/ink). It talks to a
T3 server over the same WebSocket protocol as the web and mobile clients, through
`@t3tools/client-runtime`.

## Run it

```sh
vp i                                      # once per checkout
vp run --filter @t3tools/tui build        # bundles src/ to dist/bin.mjs
node apps/tui/dist/bin.mjs                # or: vp run --filter @t3tools/tui start
```

`vp run --filter @t3tools/tui dev` rebuilds on save; restart the TUI to see the change.

## Pair with a server

The TUI saves one bearer session per server. It needs a pairing URL
(`http://host:port/pair#token=...`) once:

- **Desktop app:** Settings › Connections › create a pairing link.
- **Server started from a terminal:** `t3 serve` prints `Pairing URL:` at startup. For a server that
  is already running, `t3 pair` (in a checkout: `node apps/server/src/bin.ts pair`) mints a new one.

Then either pass it on the command line:

```sh
node apps/tui/dist/bin.mjs pair 'http://127.0.0.1:3773/pair#token=ABCD1234'
```

or start the TUI, focus the main pane, and paste the URL.

Sessions live in `$T3_TUI_CONFIG_DIR`, else `$XDG_CONFIG_HOME/t3-tui`, else `~/.config/t3-tui`, in
`connections.json` (mode 0600). `--config-dir <dir>` overrides the location for one run. The TUI
never reads or writes T3 home (`~/.t3`).

## Keys

`?` lists every binding. The basics: `tab` / `shift+tab` move focus between sidebar, main pane and
right panel; `ctrl+b` toggles the sidebar; `alt+←` / `alt+→` resize the focused side region;
`ctrl+w` closes the right panel; `ctrl+q` or `ctrl+c` quits.

`ctrl+k` or `ctrl+p` opens the command palette: commands, threads, projects and message search.
`↑`/`↓` or `ctrl+n`/`ctrl+p` move, `enter` runs, `esc` closes. The web app also opens it with
Cmd+Shift+P, which terminals cannot send.

Building a feature? Read [CONTRIBUTING-TUI.md](./CONTRIBUTING-TUI.md).
