# About this fork

This repository is an independent, unofficial fork of
[wmux](https://github.com/openwong2kim/wmux), created and maintained by
**alei wisdom** ([@wisdomLei](https://github.com/wisdomLei)).

It is **not affiliated with, endorsed by, or supported by the original
author**. Bug reports about the changes below belong here; bugs in upstream
wmux belong in the [upstream issue tracker](https://github.com/openwong2kim/wmux/issues).

The upstream project is MIT-licensed. Its copyright notice and license text
are preserved unchanged in [LICENSE](LICENSE); the fork's own modifications add
a separate copyright line there and in `package.json`. The original Git
history, authors and tags are kept intact, and the upstream repository is
configured as the `upstream` remote:

```powershell
git remote add upstream https://github.com/openwong2kim/wmux.git
```

## Upstream baseline

- Upstream release this fork started from: **v4.17.0**
- Upstream `main` commit merged into this fork: `55bf0801a`
  ("feat(remote-spawn): optional base branch with its fallback note back to
  the asker (spawn-base.1); updater off on the remaining worker paths
  (#3525)", 2026-11-26)

## What this fork changes

These are the user-visible changes on top of the baseline. Everything else is
upstream code, unmodified.

### Simplified Chinese coverage

- Filled the missing `zh` strings for Settings, Fleet, panes, the diff view,
  integration setup, the Claude integration screens and the web client —
  hundreds of keys that silently fell back to English.
- Added the theme-related strings to `zh`, `ko` and `pl` as well, so the locale
  coverage test keeps passing.

### Follow the system's light/dark appearance

- Settings → Appearance starts with a **Follow system** card. Turning it on
  keeps two theme slots — one used while the system is in light mode, one in
  dark mode — and switches between them when the operating system switches,
  including at runtime.
- Picking a specific theme card leaves follow-system mode and pins that theme.
- The choice is persisted in `session.json` (`themeMode`, `lightTheme`,
  `darkTheme`) and re-resolved at startup.
- On Windows the window's glass/appearance no longer pins the system appearance
  while follow-system is on, which is what made `prefers-color-scheme` stick to
  the wrong value before.

### Phone and browser client

- One responsive breakpoint (`max-width: 640px`) shared by the shell, the
  terminal and dialogs. Below it the web client uses a drawer for navigation,
  one pane at a time and a touch layout instead of the desktop grid.
- A phone key bar with Esc, Tab, Ctrl, arrows and other keys a software
  keyboard lacks; it sends through the same input grant and halt rules as the
  terminal.
- An approvals panel in the browser: it shows the pending prompt, the daemon's
  structured choices and the full command, and can approve or deny from the
  phone when the device is allowed to answer.
- The phone asks its pane for its own grid (`POST /api/sessions/:id/resize`)
  instead of inheriting a desk-sized, 151-column PTY, and the software keyboard
  no longer shrinks the terminal font — the app is shifted above the keyboard
  and keeps its grid.
- The browser build uses xterm's DOM renderer; WebGL blanked the pane at phone
  widths and at DPR > 1.
- A bundled Noto Sans Symbols 2 subset (`wmux Symbols`) draws the Claude TUI's
  `⏵`/`⏺`/`⎿`/`✳`/`✻` glyphs on Android, whose system fonts lack them. Its
  license is in `src/renderer/assets/fonts/LICENSE-NotoSansSymbols2.txt` and in
  `THIRD_PARTY_NOTICES`.

## Releases in this fork

- Only **Windows x64** installers are built. macOS, Linux and the iOS app are
  upstream products and are not produced here.
- Versions use a prerelease suffix, `X.Y.Z-alei.N`, so they never sort as the
  upstream author's stable release and are always published as a GitHub
  **prerelease**.
- The in-app updater follows `wisdomLei/wmux`, not the upstream repository, and
  a 404 from the update feed means "no update offered". Prereleases are not
  served by update.electronjs.org, so a fork build updates by hand: download
  the newest `Setup.exe` from the
  [Releases page](https://github.com/wisdomLei/wmux/releases).
- This fork never publishes to WinGet or Chocolatey, and never touches the
  upstream author's package identifiers (`openwong2kim.wmux`).
- Builds are **not code-signed**. SmartScreen will report an unknown publisher;
  choose **More info → Run anyway**.
- Installing this fork over an existing upstream installation replaces it in
  the same per-user location, because it is the same application (same
  product, same Squirrel package id). Keep a copy of the upstream installer if
  you want to go back.

## Working on this fork

The upstream build and test instructions still apply; see
[README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

To pull in new upstream work:

```powershell
git fetch upstream
git merge upstream/main     # resolve fork-specific files: README, FORK.md,
                            # LICENSE, package.json, AutoUpdater.ts, release.yml
```

## License

MIT. See [LICENSE](LICENSE). The upstream copyright (c) 2025 openwong2kim is
preserved in full; modifications in this fork are copyright (c) 2026 alei
wisdom.
