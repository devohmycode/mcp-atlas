# Changelog

## 0.1.0 — 2026-10-19

First release. The CLI works like skills-atlas, for MCP servers.

- **Terminal tree by default.** `mcp-atlas` opens a full-screen tree of servers by theme, with mouse support. You tick servers, choose a scope and clients, and review before anything is written. It comes back to the tree until you quit.
  - **Already installed** lists every MCP entry of your client configs, including entries the catalog doesn't know. Untick one to uninstall it. `u` and `U` mark outdated pins for update.
  - `p` shows a server's README and its risks.
  - `i` shows only servers with something to install (a package or a remote). `o` shows official servers only, and `s` changes the sort.
- **Six clients.** Claude Code, Claude Desktop, Cursor, Codex CLI, Codex desktop and Grok Build, in global or project scope. JSON or TOML config is written in place, with a `.bak` copy.
- **Commands.** `list`, `themes`, `agents`, `show`, `install` (also `--pack`), `uninstall`, `installed`, `outdated`, `update`, `export`, `import`, `doctor`, `audit on|off`, `lock`, `sync [--check]`, `packs`, `lang`, `ui`, `mcp` and `completion`.
- **Security audit.** Every command is checked before it is written. A high risk is left out unless you keep it on the review screen or pass `--no-audit`.
- **Project servers.** An `mcp-atlas.json` file lists the servers a project expects. `lock` pins their versions and `sync` installs what is missing.
- **Nine languages.** English, French, Spanish, Portuguese, German, Italian, Chinese, Japanese and Korean, chosen with `-l` or `lang`.
- **Web page.** `ui` opens the same catalog in the browser.
- **MCP server.** `mcp` lets an agent search and install servers.
- **Catalog.** The snapshot holds 152,104 servers from the official MCP registry and Smithery, and works offline. A GitHub Actions workflow rebuilds it every other day. Glama and PulseMCP join when their API keys are set.
- **Fast on a large catalog.** Installed servers, versions and search use indexes built once.
