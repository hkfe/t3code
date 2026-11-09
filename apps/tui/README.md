# T3 Code TUI

A terminal client for T3 Code, built with [Ink](https://github.com/vadimdemedes/ink). It talks to a
T3 server over the same WebSocket protocol as the web and mobile clients, through
`@t3tools/client-runtime`.

## Install

From a checkout, with Node 24 or later and [vite-plus](https://viteplus.dev) (`vp`):

```sh
apps/tui/scripts/install-local.sh
```

It runs `vp install` when `node_modules` is missing, builds `dist/bin.mjs` and links it as
`~/.local/bin/t3-tui`. Run it again after a pull to update. Put `~/.local/bin` on your `PATH`.

The bundle has every dependency inside it, so `t3-tui` needs only `node` at run time. Without the
script: `vp run --filter @t3tools/tui build`, then run `node apps/tui/dist/bin.mjs`.
`vp run --filter @t3tools/tui dev` rebuilds on save; restart the TUI to see the change.

## Run

```sh
t3-tui                                    # open the saved servers
t3-tui pair 'http://127.0.0.1:3773/pair#token=ABCD1234'
t3-tui --server http://192.168.1.20:3773  # name the server the pairing screen points to
t3-tui --config-dir /tmp/t3-tui-test      # sessions in another directory, for this run only
t3-tui --version
t3-tui --help
```

Exit codes: `0` after `ctrl+q`, `1` on an error (pairing failed, crash), `2` on bad usage or
without an interactive terminal, `128 + n` after signal `n` (`143` for SIGTERM). On quit, crash,
SIGINT, SIGTERM or SIGHUP the TUI leaves the alternate screen, shows the cursor and turns off raw
mode, mouse and focus reporting and bracketed paste.

## Pair with a server

The TUI saves one bearer session per server. It needs a pairing URL
(`http://host:port/pair#token=...`) once:

- **Desktop app:** Settings › Connections › create a pairing link.
- **Server started from a terminal:** `t3 serve` prints `Pairing URL:` at startup. For a server that
  is already running, `t3 pair` (in a checkout: `node apps/server/src/bin.ts pair`) mints a new one.

Then either pass it with `t3-tui pair <url>` (or `--server <url>`), or start the TUI, focus the
main pane, and paste the URL. After that, `t3-tui` connects on its own.

With no saved session, the pairing screen names the server of the desktop app (or of `t3 serve`)
on this machine when it runs. The TUI finds it in `$T3CODE_HOME/userdata/server-runtime.json`
(default `~/.t3`), which it only reads. That file holds no credential, so you still pair once.

Sessions live in `$T3_TUI_CONFIG_DIR`, else `$XDG_CONFIG_HOME/t3-tui`, else `~/.config/t3-tui`, in
`connections.json` (mode 0600). `--config-dir <dir>` overrides the location for one run. The TUI
never writes to T3 home (`~/.t3`).

## Troubleshooting

- **`alt` keys do nothing on macOS.** Turn on Option as Meta: Terminal.app › Settings › Profiles ›
  Keyboard › "Use Option as Meta key"; iTerm2 › Profiles › Keys › Left Option key "Esc+"; Ghostty
  `macos-option-as-alt = true`; kitty `macos_option_as_alt yes`; WezTerm
  `send_composed_key_when_left_alt_is_pressed = false`. `ctrl` bindings work without it.
- **Copy (`y`) does nothing.** Copy uses OSC 52. iTerm2 (allow clipboard access in Settings ›
  General › Selection), Ghostty, kitty, WezTerm and Alacritty support it; Terminal.app does not.
  In tmux, `set -g set-clipboard on`.
- **`shift+enter` sends.** Only terminals with the kitty keyboard protocol report it (kitty,
  Ghostty, WezTerm, iTerm2 with "Report keys using CSI u"). Use `ctrl+j` or `alt+enter`.
- **Colors look wrong.** The theme uses 24-bit color. In tmux, add
  `set -as terminal-features ",*:RGB"`.
- **`needs an interactive terminal`.** stdin and stdout must be a terminal; do not pipe them.
- **`pairing failed`.** The token is single use and expires. Make a new pairing link and check that
  this machine can reach the URL.
- **The terminal stays broken after `kill -9`.** SIGKILL cannot be caught. Run `reset`.

## Smoke test

```sh
vp run --filter @t3tools/tui smoke            # add -- --keep to keep the temp directory
```

It builds the server and TUI bundles, copies `~/t3-playground` (or `$T3_SMOKE_PLAYGROUND`) with
providers off into a temp directory, and starts a production server on a free port in 5750-5799.
Then it pairs the TUI in a pseudo-terminal, waits for the sidebar, opens the first thread, quits
with `ctrl+q`, reopens with the saved session and sends SIGTERM. Both exits must restore the
terminal. It stops the server at the end and keeps the temp directory (server log, screen output)
on failure. The playground needs at least one thread.

## Keys

`?` lists every binding. The basics: `tab` / `shift+tab` move focus between sidebar, main pane and
right panel; `ctrl+b` toggles the sidebar; `alt+←` / `alt+→` resize the focused side region;
`ctrl+w` closes the right panel; `ctrl+q` or `ctrl+c` quits.

`ctrl+k` or `ctrl+p` opens the command palette: commands, threads, projects and message search.
`↑`/`↓` or `ctrl+n`/`ctrl+p` move, `enter` runs, `esc` closes. The web app also opens it with
Cmd+Shift+P, which terminals cannot send.

Split panes show up to four threads at once. `alt+v` splits the focused pane side by side and
`alt+y` stacks it; `ctrl+f` moves focus to the next pane, `alt+x` swaps it with the next one and
`alt+c` closes it. A thread you open from the sidebar or the palette opens in the focused pane.
"Open thread to the side" in the palette opens it beside the focused pane.

`ctrl+x` opens the agent overview: threads that need you, working ones with a live timer, and
recent ones as cards. Arrows or `h` `j` `k` `l` move, `enter` or `1`-`9` open, `esc` closes. The web
app uses Option+`` ` ``, which works here too when Option sends Meta.

`ctrl+]` opens the thread switcher: cards for recent threads, the open one first. `tab` / `shift+tab`
or arrows move, `enter` opens, `1`-`9` open a card by its number, `esc` closes. The web app uses
Option+Tab, which terminals do not send reliably.

In the sidebar: `j` / `k` or arrows move, `g` / `G` jump to the top or bottom, `enter` opens a
thread or folds a section, `h` / `l` (or `←` / `→`, `space`) fold and unfold sections and project
folders, and `/` filters threads as you type (`escape` clears it).

### Composer

The composer sits under an open thread and takes the keys while the main pane has focus.

- `enter` sends. While a turn runs, `enter` steers it and `ctrl+s` queues the message instead.
- New line: `ctrl+j` works in every terminal. `alt+enter` works when Option sends Meta (macOS
  terminals: "Use Option as Meta"). `shift+enter` works only in terminals that report it (kitty
  keyboard protocol); elsewhere it sends.
- `↑` / `↓` move between lines; on an empty draft they recall earlier prompts of the thread.
  `ctrl+a` / `ctrl+e` or `home` / `end` jump in the line; `alt+←` / `alt+→`, `ctrl+←` / `ctrl+→`
  or `alt+b` / `alt+f` jump by word; `alt+backspace` and `ctrl+u` delete a word and to line start.
- `@` lists files of the thread's workspace: `↑` / `↓` pick, `tab` or `enter` insert.
- Paste or drop an image file (png, jpg, gif, webp) to attach it; `backspace` on an empty draft
  removes the last one.
- `ctrl+l` opens the model picker (type to filter, `←` / `→` effort, `enter` picks). `ctrl+g`
  cycles the runtime mode and `ctrl+t` toggles plan mode. They apply to the next message.
- `escape` clears a reply quote, else gives the keys to the thread view; `enter` or `i` takes
  them back.

Drafts live in memory per thread until you quit.

### Messages

With the keys on the thread view (`escape` from the composer), `[` / `]` select a message. Then `r`
replies to it, `y` copies its text, `f` forks the thread from an assistant response, and `o` jumps
to the message a reply quotes. Copy uses the OSC 52 escape: the terminal must allow clipboard
writes (Terminal.app does not; tmux needs `set -g set-clipboard on`).

### Pull request panel

`ctrl+y` opens the pull requests linked to the open thread in the right panel, and closes it.
`[` / `]` or `1`-`9` switch tabs, `n` goes to the next linked pull request and `r` reloads.
`j` / `k`, `ctrl+d` / `ctrl+u` and `g` / `G` scroll. In Timeline, `e` expands commit runs. In
Checks, `j` / `k` select a check, `enter` shows its log (GitHub Actions) and `escape` hides it.

### Diffs

`ctrl+v` shows the open thread's changes (its checkpoint diffs); `escape` goes back. The command
palette's "Toggle pull request code" opens the linked pull request's changed files in the right
panel.

- In the file list: `j` / `k` move, `enter` opens a file, `v` or `space` marks it viewed, `t`
  groups files by folder, `c` / `C` step through the turns or the pull request's commits.
- In a diff: `j` / `k` and `ctrl+d` / `ctrl+u` scroll, `n` / `p` jump between hunks, `w` wraps long
  lines, `x` shows folded unchanged lines, `J` / `K` open the next or previous file, `escape` goes
  back to the list. A wide region shows the diff side by side.

Viewed marks on a pull request are saved on the host, as on web. Marks on thread changes stay in
memory until you quit.

Building a feature? Read [CONTRIBUTING-TUI.md](./CONTRIBUTING-TUI.md).
