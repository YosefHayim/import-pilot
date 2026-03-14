# import-pilot

<div align="center">

[![npm version](https://img.shields.io/npm/v/import-pilot)](https://www.npmjs.com/package/import-pilot)
[![npm downloads](https://img.shields.io/npm/dm/import-pilot)](https://www.npmjs.com/package/import-pilot)
[![CI](https://github.com/YosefHayim/import-pilot/workflows/CI%20-%20Test%20&%20Build/badge.svg)](https://github.com/YosefHayim/import-pilot/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Contributors Welcome](https://img.shields.io/badge/contributors-welcome-brightgreen.svg)](https://github.com/YosefHayim/import-pilot/issues)

</div>

## What is it

import-pilot is a zero-config CLI that automatically scans your project, finds every missing import, resolves where it lives, and inserts the correct `import` statement — across React, Vue, Angular, Svelte, Astro, TypeScript, JavaScript, and Python.

---

## Why

You write `<Card>` or `formatName()` in your code, but the import is missing. Your editor might catch it — or it might not. In large codebases with hundreds of components, this becomes a constant friction point.

**import-pilot** scans your project, finds every missing import, resolves where it lives, and inserts the correct `import` statement. It works across frameworks (React, Vue, Angular, Svelte, Astro) and languages (TypeScript, JavaScript, Python), respects your `tsconfig.json` path aliases, and runs in under a second.

---

## Install

Pick your package manager:

```bash
# npm
npm install -g import-pilot

# yarn
yarn global add import-pilot

# pnpm
pnpm add -g import-pilot

# bun
bun add -g import-pilot
```

Or install locally as a dev dependency:

```bash
npm install --save-dev import-pilot
```

**Requires Node.js >= 18**

---

## Quick Start

```bash
# Fix missing imports in current directory
import-pilot

# Preview what would change (no file modifications)
import-pilot --dry-run

# Scan a specific directory with verbose output
import-pilot ./src --verbose
```

### Interactive Setup

Run the setup wizard to configure import-pilot for your project. It detects your file types, creates a `.import-pilot.json` config, adds npm scripts, and optionally sets up husky pre-commit hooks — all interactively.

```bash
import-pilot init
```

---

## How It Works

```
scan files → find used identifiers → check what's imported → resolve the rest → insert imports
```

1. **Scan** — Discovers all files matching your configured extensions
2. **Parse** — Extracts existing imports and used identifiers (regex-based, no heavy AST deps)
3. **Resolve** — Matches unimported identifiers against an export cache built from your project
4. **Fix** — Generates and inserts the correct import statements

Path aliases from `tsconfig.json` (e.g. `@/components/Card`) are used automatically when available. Disable with `--no-alias`.

---

## Supported Languages & Frameworks

| Language                | Extensions                | Frameworks                                        |
| ----------------------- | ------------------------- | ------------------------------------------------- |
| TypeScript / JavaScript | `.ts` `.tsx` `.js` `.jsx` | React, Angular, Next.js, Nuxt                     |
| Vue                     | `.vue`                    | Vue 2 & 3 (SFC `<script>` / `<script setup>`)     |
| Svelte                  | `.svelte`                 | SvelteKit                                         |
| Astro                   | `.astro`                  | Astro frontmatter                                 |
| Python                  | `.py`                     | `from`/`import` statements, `def`/`class` exports |
| Elixir                  | `.ex` `.exs`              | Mix projects                                      |
| Go                      | `.go`                     | Go modules                                        |
| Rust                    | `.rs`                     | Cargo projects                                    |

See [open issues](https://github.com/YosefHayim/import-pilot/issues) for additional language support.

---

## Reports

After each run, import-pilot can generate a report file at your project root. Configure via `.import-pilot.json` or the setup wizard.

| Format   | Flag            | Output file                |
| -------- | --------------- | -------------------------- |
| Markdown | `--report md`   | `import-pilot-report.md`   |
| JSON     | `--report json` | `import-pilot-report.json` |
| Text     | `--report txt`  | `import-pilot-report.txt`  |
| Off      | `--report none` | _(no file)_                |

Reports include: time taken, files scanned, files changed, each import added (before → after), and any unresolved identifiers.

---

## CLI Options

```
import-pilot [directory] [options]
```

| Option         | Short | Description                                   | Default                                     |
| -------------- | ----- | --------------------------------------------- | ------------------------------------------- |
| `--dry-run`    | `-d`  | Preview changes without writing files         | `false`                                     |
| `--verbose`    | `-v`  | Detailed output                               | `false`                                     |
| `--extensions` | `-e`  | File extensions to scan (comma-separated)     | `.ts,.tsx,.js,.jsx,.vue,.svelte,.astro,.py` |
| `--ignore`     | `-i`  | Glob patterns to ignore (comma-separated)     | —                                           |
| `--config`     | `-c`  | Path to config file                           | `.import-pilot.json`                        |
| `--no-alias`   | —     | Disable tsconfig path alias resolution        | `false`                                     |
| `--report`     | `-r`  | Report format: `md`, `json`, `txt`, or `none` | `none`                                      |

### Subcommands

| Command             | Description              |
| ------------------- | ------------------------ |
| `import-pilot init` | Interactive setup wizard |

---

## Configuration

Create `.import-pilot.json` in your project root (or run `import-pilot init`):

```json
{
  "extensions": [".ts", ".tsx", ".vue", ".py"],
  "ignore": ["**/node_modules/**", "**/dist/**", "**/*.test.ts"],
  "useAliases": true,
  "verbose": false,
  "dryRun": false,
  "report": "md"
}
```

CLI flags override config file values.

---

## Integration

### npm scripts

```json
{
  "scripts": {
    "import-pilot": "import-pilot",
    "import-pilot:check": "import-pilot --dry-run --verbose",
    "import-pilot:fix": "import-pilot"
  }
}
```

### Pre-commit hook (husky)

```bash
npx husky add .husky/pre-commit "npx import-pilot --dry-run"
```

Or let `import-pilot init` set this up for you.

### CI

```yaml
- name: Check imports
  run: npx import-pilot --dry-run --verbose
```

---

## Contributing

PRs and issues welcome. Fork the repo, create a feature branch, and open a pull request. Run `npm test` before submitting.

---

## License

MIT

---

<div align="center">

Built by [**Yosef Hayim Sabag**](https://github.com/YosefHayim)

[Bug Reports](https://github.com/YosefHayim/import-pilot/issues) · [Buy Me a Coffee](https://buymeacoffee.com/yosefhayim)

</div>
