# Changelog

## Unreleased

The CLI now works like skills-atlas.

- **The tree is the default.** `mcp-atlas` with no command opens a full-screen Ink tree, with mouse support. You tick servers, then choose scope and clients and review, and it comes back to the tree until you quit. Installed servers start ticked: untick one to uninstall it. `u` and `U` mark outdated servers for update. `p` shows the README and its risks. The review screen leaves out high-risk servers unless you keep them.
- **skills-atlas flags.** `-a/--agent` replaces `-c/--client` (`*` means every client). `-g/--global` replaces `-g/--user`. `-q/--search` replaces `-q/--query`. `agents` replaces `clients`, which stays as an alias. `-t` takes several themes. `-s/--sort` and `--catalog <path|url>` are new.
- **`install` asks what the flags leave open.** It no longer reviews unless you pass `-y`. With `-a` and `-g` or `-p` it writes. `-y` uses the remembered or detected clients and the remembered scope. Without a terminal, `-a` is required. The last clients and scope are remembered.
- **Scope is optional** for `uninstall`, `installed`, `export`, `outdated` and `doctor`. Leave it out to cover both scopes. `uninstall` no longer needs `-y`.
- **New commands.**
  - `update [ids...]` rewrites outdated pins.
  - `doctor` checks the client config files.
  - `audit on|off` sets the audit for good.
  - `lock` and `sync [--check]` work from a project's `mcp-atlas.json`.
  - `packs` and `install --pack` handle packs.
  - `lang` and `-l/--lang` set the language: English, French, Spanish, Portuguese, German, Italian, Chinese, Japanese or Korean.
- **`ui`** opens the browser (`--no-open` to skip it) and serves until Ctrl+C.
- A notice in the tree when a newer mcp-atlas is on npm. A logo in `--help`.
- Packaging: `src/launch.ts` entry, `dev` and `prepublishOnly` scripts, LICENSE, this changelog.
