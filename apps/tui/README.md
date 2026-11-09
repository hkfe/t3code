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

`?` opens the key help: every binding by feature plus the leader map. Type to search, `esc` closes.
The basics: `tab` / `shift+tab` move focus between sidebar, main pane and right panel; `ctrl+b`
toggles the sidebar; `alt+←` / `alt+→` resize the focused side region; `ctrl+w` closes the right
panel; `ctrl+q` or `ctrl+c` quits.

Less used actions sit behind the leader key, `ctrl+space` (or `ctrl+\`), as in tmux: press it,
let go, then press the next key. A popup lists the next keys; `esc` cancels.

| Key               | Action                       | Key        | Action                  |
| ----------------- | ---------------------------- | ---------- | ----------------------- |
| `ctrl+k` `ctrl+p` | Command palette              | leader `v` | Split pane side by side |
| `ctrl+n`          | New thread                   | leader `s` | Split pane stacked      |
| `ctrl+]`          | Thread switcher              | leader `o` | Next pane               |
| `ctrl+o`          | Thread actions               | leader `m` | Swap pane with the next |
| `ctrl+r`          | Next approval or question    | leader `x` | Close pane              |
| `ctrl+l`          | Model picker                 | leader `d` | Thread changes (diff)   |
| `ctrl+g` `ctrl+t` | Runtime mode, plan mode      | leader `p` | Pull request panel      |
| `ctrl+y`          | Open a notification's thread | leader `a` | Agent overview          |
| `?`               | Key help                     | leader `,` | Settings                |
| `ctrl+q`          | Quit                         | leader `?` | Key help                |

On macOS, `ctrl+space` switches the input source when more than one is set up. Turn that shortcut
off in System Settings › Keyboard › Keyboard Shortcuts › Input Sources, use `ctrl+\`, or pick
another leader key in `keybindings.json`.

### Change keys

Put your bindings in `keybindings.json` beside `connections.json` (default
`~/.config/t3-tui/keybindings.json`). It uses the web app's format, without `when`:

```json
[
  { "key": "f2", "command": "diff.toggle" },
  { "key": "leader t", "command": "thread-actions.rename" },
  { "key": "ctrl+a", "command": "core.leader" }
]
```

A rule replaces every default key of its command and applies where the default did. `leader x`
binds a key after the leader; `core.leader` moves the leader key. Keys use the web syntax (`ctrl+`,
`alt+`, `shift+`, `f1`-`f12`, `home`, `pageup`...). The command ids are in `?` and the command
palette. Restart the TUI after a change. Rules that are not valid, and keys that hide other keys,
show in the status bar and at the top of `?`.

`ctrl+k` or `ctrl+p` opens the command palette: commands, threads, projects and message search.
`↑`/`↓` or `ctrl+n`/`ctrl+p` move, `enter` runs, `esc` closes. The web app also opens it with
Cmd+Shift+P, which terminals cannot send.

Split panes show up to four threads at once. Leader `v` splits the focused pane side by side and
leader `s` stacks it; leader `o` moves focus to the next pane, leader `m` swaps it with the next one
and leader `x` closes it. A thread you open from the sidebar or the palette opens in the focused pane.
"Open thread to the side" in the palette opens it beside the focused pane.

Leader `a` opens the agent overview: threads that need you, working ones with a live timer, and
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

Leader `p` opens the pull requests linked to the open thread in the right panel, and closes it.
`[` / `]` or `1`-`9` switch tabs, `n` goes to the next linked pull request and `r` reloads.
`j` / `k`, `ctrl+d` / `ctrl+u` and `g` / `G` scroll. In Timeline, `e` expands commit runs. In
Checks, `j` / `k` select a check, `enter` shows its log (GitHub Actions) and `escape` hides it.

### Diffs

Leader `d` shows the open thread's changes (its checkpoint diffs); `escape` goes back. The command
palette's "Toggle pull request code" opens the linked pull request's changed files in the right
panel.

- In the file list: `j` / `k` move, `enter` opens a file, `v` or `space` marks it viewed, `t`
  groups files by folder, `c` / `C` step through the turns or the pull request's commits.
- In a diff: `j` / `k` and `ctrl+d` / `ctrl+u` scroll, `n` / `p` jump between hunks, `w` wraps long
  lines, `x` shows folded unchanged lines, `J` / `K` open the next or previous file, `escape` goes
  back to the list. A wide region shows the diff side by side.

Viewed marks on a pull request are saved on the host, as on web. Marks on thread changes stay in
memory until you quit.

### Terminals

`ctrl+z` opens the open thread's terminals in the right panel, and closes it. The command palette's
"Open terminal in main pane" shows them in the main pane instead (`escape` goes back). Opening it
starts a shell when the thread has none.

- While the terminal has the keys, every key goes to the shell, `ctrl+c` and `tab` too.
  `ctrl+\\` gives the keys back to the TUI; `enter` or `i` hands them to the shell again.
- Without the keys: `n` starts a new terminal, `x` closes the shown one, `r` renames it, `[` / `]`
  or `1`-`9` switch tabs. `k` / `j`, `pageup` / `pagedown` (or `ctrl+u` / `ctrl+d`) and `g` / `G`
  scroll back.

The terminal follows the pane size. Names given with `r` stay in memory until you quit. A
connection without terminal operate access sees the output read-only.

### Projects and workspaces

`alt+p` (or "Projects…" in the palette) lists projects: pinned first, with thread counts. `j` / `k`
move, `enter` or `h` / `l` fold a project's threads, `enter` on a thread opens it. `a` adds a project
by the absolute path of an existing folder on the server, `p` pins or unpins, `r` renames, `s` shows
its settings (path, default model with `m`, scripts) and `y` copies its path. `d` asks before it
removes a project and its threads: only `y` removes it, and the folder stays on disk.

The status bar shows the open thread's branch, `↑` ahead, `↓` behind, `●` changed files and its open
pull request. `alt+g` opens the workspace panel with the same details. There, `w` moves a thread
without a worktree into a new one (you can edit the branch name first), `y` copies the path, `e`
opens it in `$VISUAL` or `$EDITOR` (only for a path on this machine) and `r` refreshes the status.

Building a feature? Read [CONTRIBUTING-TUI.md](./CONTRIBUTING-TUI.md).
