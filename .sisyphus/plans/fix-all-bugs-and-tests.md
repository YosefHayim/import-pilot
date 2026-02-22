# Fix All 19 Bugs + Regression Tests + Coverage Gaps

## TL;DR

> **Quick Summary**: Fix all 19 open bugs across the regex parser, plugins (JS/TS, Python, Rust, Go, Elixir), import resolver, framework parser, and CLI. Add regression tests for every fix. Fill test coverage gaps for untested modules.
>
> **Deliverables**:
>
> - 19 bug fixes with regression tests
> - Unit tests for autoImportCli.ts and fileScanner.ts (currently 0% coverage)
> - E2E file modification tests (beyond dry-run)
> - Clean 497/497 test baseline restored
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 8 waves
> **Critical Path**: Phase 0 (baseline) -> #101 (error handling) -> #74 (type-only) -> #79 (re-exports) -> #88 (collision) -> Coverage tasks -> Final QA

---

## Context

### Original Request

Fix all open GitHub issues, organized with tests added so these issues won't be repeated.

### Interview Summary

**Key Discussions**:

- Scope: Bugs + Tests first (19 bugs). 13 enhancements and 2 performance issues deferred.
- Test approach: Tests-after (fix bug, then add regression test). Matches project conventions.
- Coverage: Include unit test tasks for autoImportCli.ts and fileScanner.ts.

**Research Findings**:

- Test baseline: 458 passing, 39 failing (E2E fails because dist/ missing). Need `npm run build` first.
- Architecture: Plugin-based regex parsing. LanguagePlugin interface with 5 implementations.
- Weak points: Fragile regex patterns, no re-export handling, first-match-wins resolution, silent error swallowing.

### Metis Review

**Identified Gaps** (addressed):

- Broken baseline: 39 E2E tests fail without `npm run build`. Added Phase 0 to establish green baseline.
- Bug dependency chains: #101 must be first (unmasks debugging). #74 before #79. #90 before #91.
- astParser.ts collision zone: 4 bugs modify same file — must be sequential.
- Coverage assumption wrong: wizardUtils.ts already tested by setupWizard.test.ts. Real gap is autoImportCli.ts and fileScanner.ts.
- Interface change risk: ExportInfo/ImportStatement changes must update all consumers.

---

## Work Objectives

### Core Objective

Fix all 19 open bugs with verified regression tests, fill critical test coverage gaps, and ensure no silent regressions.

### Concrete Deliverables

- 19 bug-fix commits with regression tests in corresponding test files
- New test file: `src/__tests__/autoImportCli.test.ts` (orchestrator coverage)
- New test file: `src/__tests__/fileScanner.test.ts` (file discovery coverage)
- Expanded E2E tests: actual file modification verification (not just dry-run)
- All 497+ tests passing green

### Definition of Done

- [ ] `npm run build && npm test` shows 0 failures
- [ ] `npx tsc --noEmit` shows 0 errors
- [ ] Every bug has at least 2 regression tests (broken case + boundary case)
- [ ] autoImportCli.ts and fileScanner.ts have >70% statement coverage

### Must Have

- Regression test for every bug fix
- One commit per bug (for git bisect)
- `npx tsc --noEmit` clean after every task
- Existing 458 passing tests still pass

### Must NOT Have (Guardrails)

- No structural refactoring of astParser.ts — fix only the specific regex
- No transitive re-export resolution (A re-exports B which re-exports C)
- No configurable collision resolution strategy — warn + first-match only
- No TypeScript project references support in #91 — `extends` chain only (up to 5 levels)
- No interactive wizard flow tests (requires TTY mocking)
- No E2E file modification tests for Python/Rust/Go/Elixir — unit tests cover those
- No `ExportInfo` or `ImportStatement` interface changes without updating ALL consumers in the same task
- No extra regex "improvements" while fixing adjacent patterns — stay on target

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Tests-after
- **Framework**: Jest + ts-jest (ESM preset)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Regex fixes**: Bash — run `npm test -- --testPathPattern='<file>' --verbose`, verify PASS + specific test name
- **CLI fixes**: Bash — `npm run build && npm test -- --testPathPattern='e2e'`
- **All tasks**: Bash — `npx tsc --noEmit`, verify 0 errors

### Two Verification Tiers

- **Tier 1** (regex/parser fixes): `npm test -- --testPathPattern='<relevant_test_file>' --verbose`
- **Tier 2** (CLI/file-write fixes): `npm run build && npm test`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Baseline — must complete first):
└── Task 0: Establish green baseline (npm run build && npm test = 497/497)    [quick]

Wave 1 (Foundation — error handling):
└── Task 1: #101 — Silent error swallowing + unprotected fs.writeFile        [deep]

Wave 2 (JS/TS Parser Core — SEQUENTIAL, same file):
├── Task 2: #74 — type-only imports matched as default imports               [unspecified-high]
├── Task 3: #78 — optional chaining false positives                          [quick]
├── Task 4: #76 — dynamic imports not recognized                             [unspecified-high]
└── Task 5: #77 — TypeScript decorators not detected                         [unspecified-high]

Wave 3 (Framework + Re-exports — 2 parallel groups):
├── Task 6: #75 — Vue/Svelte multiple script tags                            [unspecified-high]
├── Task 7: #79 — re-exports not resolved in cache (depends: T2)             [deep]
└── Task 8: #87(CJS part) — CommonJS module.exports detection                [unspecified-high]

Wave 4 (Resolver — SEQUENTIAL):
├── Task 9: #88 — collision resolution for same-name exports (depends: T7)   [deep]
├── Task 10: #90 — baseUrl without paths in tsconfig                         [unspecified-high]
└── Task 11: #91 — tsconfig extends chain (depends: T10)                     [deep]

Wave 5 (Multi-language Plugins — ALL PARALLEL):
├── Task 12: #80 — Elixir multi-alias syntax                                 [quick]
├── Task 13: #81 — Python conditional imports                                [quick]
├── Task 14: #82 — Python relative imports                                   [quick]
├── Task 15: #83 — Python f-string expressions                               [quick]
├── Task 16: #84 — Rust nested multiline use trees                           [unspecified-high]
├── Task 17: #85 — Rust macro_rules! exports                                 [quick]
├── Task 18: #86 — Go dot/blank imports                                      [quick]
└── Task 19: #87(Elixir part) — Elixir defimpl detection                     [quick]

Wave 6 (CLI):
└── Task 20: #103 — Setup wizard config overwrite check                      [quick]

Wave 7 (Test Coverage Gaps):
├── Task 21: autoImportCli.ts unit tests                                     [unspecified-high]
├── Task 22: fileScanner.ts unit tests                                       [unspecified-high]
└── Task 23: #102 — E2E file modification tests                              [deep]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit                                           (oracle)
├── Task F2: Code quality review                                             (unspecified-high)
├── Task F3: Real manual QA                                                  (unspecified-high)
└── Task F4: Scope fidelity check                                            (deep)

Critical Path: T0 → T1 → T2 → T7 → T9 → T21 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 8 (Wave 5)
```

### Dependency Matrix

| Task    | Depends On | Blocks | Wave  |
| ------- | ---------- | ------ | ----- |
| T0      | —          | All    | 0     |
| T1      | T0         | T2-T23 | 1     |
| T2      | T1         | T3,T7  | 2     |
| T3      | T2         | T4     | 2     |
| T4      | T3         | T5     | 2     |
| T5      | T4         | —      | 2     |
| T6      | T1         | —      | 3     |
| T7      | T2         | T9     | 3     |
| T8      | T1         | —      | 3     |
| T9      | T7         | —      | 4     |
| T10     | T1         | T11    | 4     |
| T11     | T10        | —      | 4     |
| T12-T19 | T1         | —      | 5     |
| T20     | T1         | —      | 6     |
| T21-T23 | T1-T20     | —      | 7     |
| F1-F4   | All        | —      | FINAL |

### Agent Dispatch Summary

- **Wave 0**: 1 — T0 → `quick`
- **Wave 1**: 1 — T1 → `deep`
- **Wave 2**: 4 sequential — T2-T5 → `unspecified-high` / `quick`
- **Wave 3**: 3 parallel — T6-T8 → `unspecified-high` / `deep`
- **Wave 4**: 3 sequential — T9-T11 → `deep` / `unspecified-high`
- **Wave 5**: 8 parallel — T12-T19 → `quick` / `unspecified-high`
- **Wave 6**: 1 — T20 → `quick`
- **Wave 7**: 3 parallel — T21-T23 → `unspecified-high` / `deep`
- **FINAL**: 4 parallel — F1-F4 → `oracle` / `unspecified-high` / `deep`

---

## TODOs

[x] 0. Establish Green Test Baseline

**What to do**:

- Run `npm run build` to generate `dist/` directory
- Run `npm test` — verify all 497 tests pass (including 39 E2E tests that currently fail)
- If any non-E2E tests fail, investigate and fix before proceeding
- Commit only if build artifacts or config needed fixing

**Must NOT do**:

- Do not fix any of the 19 bugs yet
- Do not modify source code beyond what's needed for build

**Recommended Agent Profile**:

- **Category**: `quick`
- **Skills**: []

**Parallelization**:

- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 0 (solo)
- **Blocks**: All subsequent tasks
- **Blocked By**: None

**References**:

- `package.json` scripts section — `build`, `test` commands
- `jest.config.js` — test configuration and patterns
- `src/__tests__/e2e.test.ts` — the 39 failing tests require `dist/` to exist
- `.github/workflows/ci.yml` — CI runs `npm run build` before `npm test`

**Acceptance Criteria**:

- [ ] `npm run build` completes with 0 errors
- [ ] `npm test` shows ALL tests passing (497/497 or close)
- [ ] `npx tsc --noEmit` shows 0 errors

**QA Scenarios**:

```
Scenario: Build and full test suite passes
  Tool: Bash
  Steps:
    1. Run `npm run build` — capture stdout/stderr
    2. Run `npm test 2>&1` — capture output
    3. Parse output for "Tests:" line showing X passed, 0 failed
  Expected Result: 0 build errors, 0 test failures
  Evidence: .sisyphus/evidence/task-0-green-baseline.txt
```

**Commit**: YES

- Message: `chore: establish green test baseline`
- Pre-commit: `npm run build && npm test`

---

[x] 1. Fix #101: Silent error swallowing + unprotected fs.writeFile

**What to do**:

- In `src/resolver/importResolver.ts` lines 71-73: Replace empty `catch {}` with verbose-gated warning log using chalk.yellow. Include file path and error message. Continue processing (do not throw).
- In `src/cli/autoImportCli.ts` `applyFixes()` method (~lines 231-261): Wrap `fs.writeFile()` call in try-catch. On error, log chalk.red error with file path and continue to next file.
- In `src/reporter/reportGenerator.ts` (~line 150): Wrap report file write in try-catch with chalk.red error.
- Add regression tests in `importResolver.test.ts`: test that buildExportCache skips unreadable files without crashing. Test that a warning message is produced when verbose=true.
- Add regression test concept for file write errors (mock fs or use read-only temp dir).

**Must NOT do**:

- Do not add retry logic, backup files, or rollback mechanisms
- Do not throw errors — always continue to next file
- Do not change the behavior for valid files (only add logging for failures)

**Recommended Agent Profile**:

- **Category**: `deep`
- **Skills**: []
  - Task requires understanding error propagation across 3 files and testing error paths

**Parallelization**:

- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 1 (solo)
- **Blocks**: All bug-fix tasks (T2-T20)
- **Blocked By**: T0 (baseline)

**References**:
**Pattern References**:

- `src/resolver/importResolver.ts:71-73` — The silent `catch {}` block to replace
- `src/cli/autoImportCli.ts:231-261` — The `applyFixes()` method with unprotected writeFile at line 260
- `src/reporter/reportGenerator.ts:~150` — Report file write location

**API/Type References**:

- `chalk` usage in `autoImportCli.ts` — follow existing chalk.red/chalk.yellow patterns for errors/warnings

**Test References**:

- `src/__tests__/importResolver.test.ts` — existing test patterns for ImportResolver class

**Acceptance Criteria**:

- [ ] `grep -c 'catch {' src/resolver/importResolver.ts` returns 0 (no empty catches)
- [ ] `grep -c 'catch' src/cli/autoImportCli.ts` shows try-catch around writeFile
- [ ] New test: "buildExportCache skips unreadable files" in importResolver.test.ts — PASS
- [ ] `npx tsc --noEmit` = 0 errors
- [ ] `npm test -- --testPathPattern='importResolver' --verbose` = all PASS

**QA Scenarios**:

```
Scenario: Export cache handles unreadable file gracefully
  Tool: Bash
  Steps:
    1. Run `npm test -- --testPathPattern='importResolver' --testNamePattern='unreadable|error|skip' --verbose`
    2. Check output for PASS on the new error-handling test
  Expected Result: Test passes, no empty catch blocks remain
  Evidence: .sisyphus/evidence/task-1-error-handling.txt

Scenario: No empty catch blocks remain in changed files
  Tool: Bash
  Steps:
    1. Run `grep -n 'catch\s*{' src/resolver/importResolver.ts src/cli/autoImportCli.ts`
    2. Verify each catch block has a body (logging or error handling)
  Expected Result: Zero empty catch {} blocks
  Evidence: .sisyphus/evidence/task-1-no-empty-catches.txt
```

**Commit**: YES

- Message: `fix(#101): add error logging in export cache + protect fs.writeFile`
- Files: `src/resolver/importResolver.ts`, `src/cli/autoImportCli.ts`, `src/reporter/reportGenerator.ts`, `src/__tests__/importResolver.test.ts`
- Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='importResolver'`

---

[x] 2. Fix #74: Type-only imports matched as default imports

**What to do**:

- In `src/parser/astParser.ts` line 68: Update the default import regex to exclude `import type X from 'module'`. Add negative lookahead: `/import\s+(?!type\s)(\w+)\s+from\s+['"]([^'"]+)['"]/g`
- Also handle `import type * as NS from 'module'` (namespace type-only import) — exclude from namespace import regex too.
- Add regression tests in `astParser.test.ts`:
  - Test: `import type React from 'react'` should NOT be captured as a default import
  - Test: `import type { FC } from 'react'` should NOT be captured as a named import
  - Test: `import React from 'react'` STILL captured correctly (regression guard)
  - Test: `import type * as NS from 'module'` should NOT be captured

**Must NOT do**:

- Do not generate `import type` statements (that's enhancement scope)
- Do not add `isTypeOnly` field to ImportStatement interface
- Do not modify jsTsPlugin.ts — fix is in astParser only

**Recommended Agent Profile**:

- **Category**: `unspecified-high`
- **Skills**: []

**Parallelization**:

- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 2 (sequential with T3, T4, T5)
- **Blocks**: T3 (#78), T7 (#79 — type re-exports depend on this)
- **Blocked By**: T1 (#101)

**References**:
**Pattern References**:

- `src/parser/astParser.ts:68` — The default import regex to modify
- `src/parser/astParser.ts:51` — Named import regex (may also need type exclusion)
- `src/parser/astParser.ts:83` — Namespace import regex (needs type exclusion)

**Test References**:

- `src/__tests__/astParser.test.ts` — existing test structure with `describe('AstParser')`
- `src/__tests__/jsTsPlugin.test.ts` — tests `import type` handling at the plugin level

**Acceptance Criteria**:

- [ ] `import type X from 'module'` not captured as default import
- [ ] `import type { X } from 'module'` not captured as named import
- [ ] `import type * as NS from 'module'` not captured
- [ ] `import X from 'module'` STILL captured correctly
- [ ] `import { X } from 'module'` STILL captured correctly
- [ ] `npx tsc --noEmit` = 0 errors
- [ ] `npm test -- --testPathPattern='astParser' --verbose` = all PASS

**QA Scenarios**:

```
Scenario: Type-only imports excluded from parsing
  Tool: Bash
  Steps:
    1. Run `npm test -- --testPathPattern='astParser' --testNamePattern='type' --verbose`
    2. Verify new type-only tests pass
    3. Run `npm test -- --testPathPattern='astParser' --verbose` for full suite
  Expected Result: All astParser tests pass including new type-only regression tests
  Evidence: .sisyphus/evidence/task-2-type-only-imports.txt

Scenario: Regular imports still work after fix
  Tool: Bash
  Steps:
    1. Run `npm test -- --testPathPattern='(astParser|jsTsPlugin)' --verbose`
    2. Verify ALL existing import parsing tests still pass
  Expected Result: Zero regressions in existing tests
  Evidence: .sisyphus/evidence/task-2-no-regression.txt
```

**Commit**: YES

- Message: `fix(#74): exclude type-only imports from default import matching`
- Files: `src/parser/astParser.ts`, `src/__tests__/astParser.test.ts`
- Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='(astParser|jsTsPlugin)'`

[x] 3. Fix #78: Optional chaining (?.) causes false positives

**What to do**:

- In `src/parser/astParser.ts` ~line 100: Update the function call lookbehind regex from `/(?<![.\w])([a-z][a-zA-Z0-9]*)\s*\(/g` to `/(?<![.?\w])([a-z][a-zA-Z0-9]*)\s*\(/g` — add `?` to the negative lookbehind character class.
- Add regression tests in `astParser.test.ts`:
  - Test: `obj?.method()` should NOT capture `method` as a standalone identifier
  - Test: `obj.method()` STILL excluded (regression guard)
  - Test: `method()` (no prefix) STILL captured

**Must NOT do**: Do not refactor the entire identifier detection section.

**Recommended Agent Profile**:

- **Category**: `quick`
- **Skills**: []

**Parallelization**:

- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 2 (sequential after T2)
- **Blocks**: T4
- **Blocked By**: T2

**References**:

- `src/parser/astParser.ts:~100` — function call regex with lookbehind
- `src/__tests__/astParser.test.ts` — test file

**Acceptance Criteria**:

- [ ] `obj?.method()` does not produce `method` as used identifier
- [ ] `method()` still captured as used identifier
- [ ] `npx tsc --noEmit` = 0 errors
- [ ] `npm test -- --testPathPattern='astParser' --verbose` = all PASS

**QA Scenarios**:

```
Scenario: Optional chaining excluded from identifier detection
  Tool: Bash
  Steps:
    1. Run `npm test -- --testPathPattern='astParser' --testNamePattern='optional|chaining' --verbose`
  Expected Result: New optional chaining test passes
  Evidence: .sisyphus/evidence/task-3-optional-chaining.txt
```

**Commit**: YES

- Message: `fix(#78): handle optional chaining in identifier detection`
- Files: `src/parser/astParser.ts`, `src/__tests__/astParser.test.ts`
- Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='astParser'`

---

[x] 4. Fix #76: Dynamic imports (import()) not recognized

**What to do**:

- In `src/parser/astParser.ts`: Add new regex to detect static dynamic imports: `/(?:await\s+)?import\s*\(\s*['"]([^'"]+)['"]\s*\)/g`. Extract the module path and treat it as an existing import (so identifiers from that module aren't flagged as missing).
- Ensure template literal dynamic imports (`import(\`...\`)`) are recognized but NOT resolved (can't determine static path).
- Add regression tests in `astParser.test.ts`:
  - Test: `const mod = await import('./module')` — recognized as import of `./module`
  - Test: `import('./utils/helper')` — recognized
  - Test: `import(\`./\${name}\`)` — NOT recognized (dynamic path, skip gracefully)
  - Test: Regular `import X from 'module'` STILL works

**Must NOT do**: Do not try to resolve dynamic import paths or add them to the export cache.

**Recommended Agent Profile**:

- **Category**: `unspecified-high`
- **Skills**: []

**Parallelization**:

- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 2 (sequential after T3)
- **Blocks**: T5
- **Blocked By**: T3

**References**:

- `src/parser/astParser.ts:47-91` — existing import regex section where new pattern should be added
- `src/__tests__/astParser.test.ts` — test file

**Acceptance Criteria**:

- [ ] `await import('./module')` recognized as import
- [ ] Template literal dynamic imports skipped without error
- [ ] Existing import patterns unaffected
- [ ] `npx tsc --noEmit` = 0 errors
- [ ] `npm test -- --testPathPattern='astParser' --verbose` = all PASS

**QA Scenarios**:

```
Scenario: Dynamic imports recognized
  Tool: Bash
  Steps:
    1. Run `npm test -- --testPathPattern='astParser' --testNamePattern='dynamic' --verbose`
  Expected Result: New dynamic import tests pass
  Evidence: .sisyphus/evidence/task-4-dynamic-imports.txt
```

**Commit**: YES

- Message: `fix(#76): recognize dynamic import() expressions`
- Files: `src/parser/astParser.ts`, `src/__tests__/astParser.test.ts`
- Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='astParser'`

---

[x] 5. Fix #77: TypeScript decorators not detected as used identifiers

**What to do**:

- In `src/plugins/jsTsPlugin.ts` or `src/parser/astParser.ts`: Add regex to detect decorator identifiers: `/@([A-Z]\w*)/g` — captures PascalCase names after `@`.
- Add captured decorator names to the used identifiers set.
- Add regression tests in `jsTsPlugin.test.ts` (or astParser.test.ts):
  - Test: `@Component({})` detects `Component` as used identifier
  - Test: `@Injectable()` detects `Injectable`
  - Test: `@deprecated` (lowercase) — do NOT capture (it's a built-in)
  - Test: Existing identifier detection still works

**Must NOT do**: Do not handle decorator factories with complex expressions like `@Foo.Bar()`.

**Recommended Agent Profile**:

- **Category**: `unspecified-high`
- **Skills**: []

**Parallelization**:

- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 2 (sequential after T4)
- **Blocks**: None
- **Blocked By**: T4

**References**:

- `src/plugins/jsTsPlugin.ts` — `findUsedIdentifiers()` method
- `src/parser/astParser.ts:93-144` — identifier detection regexes
- `src/__tests__/jsTsPlugin.test.ts` — test file for plugin-level tests

**Acceptance Criteria**:

- [ ] `@Component({})` produces `Component` as used identifier
- [ ] `@Injectable()` produces `Injectable`
- [ ] Lowercase decorators not captured
- [ ] `npx tsc --noEmit` = 0 errors
- [ ] `npm test -- --testPathPattern='(jsTsPlugin|astParser)' --verbose` = all PASS

**QA Scenarios**:

```
Scenario: Decorators detected as used identifiers
  Tool: Bash
  Steps:
    1. Run `npm test -- --testPathPattern='(jsTsPlugin|astParser)' --testNamePattern='decorator' --verbose`
  Expected Result: New decorator tests pass
  Evidence: .sisyphus/evidence/task-5-decorators.txt
```

**Commit**: YES

- Message: `fix(#77): detect TypeScript decorator identifiers`
- Files: `src/plugins/jsTsPlugin.ts` or `src/parser/astParser.ts`, corresponding test file
- Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='(jsTsPlugin|astParser)'`

- [ ] 6. Fix #75: Vue/Svelte files with multiple script tags — only first extracted

  **What to do**:
  - In `src/parser/frameworkParser.ts` lines 76-77 (Vue) and 110-111 (Svelte): Replace `.match()` with `.matchAll()` or loop with `.exec()` to capture ALL `<script>` tags.
  - Concatenate all script block contents (joined with newline) for analysis.
  - For import insertion: insert into `<script setup>` if it exists (Vue 3 convention), otherwise first `<script>`.
  - Update `FrameworkParseResult` if needed to track multiple script blocks.
  - Add regression tests in `frameworkParser.test.ts`:
    - Test: Vue file with `<script setup>` + `<script>` — both extracted
    - Test: Svelte file with `<script context="module">` + `<script>` — both extracted
    - Test: Single `<script>` still works (regression guard)
    - Test: Import insertion goes to `<script setup>` when present

  **Must NOT do**:
  - Do not parse template/markup sections for identifiers
  - Do not change how Astro frontmatter is handled (not affected)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T7, T8)
  - **Blocks**: None
  - **Blocked By**: T1

  **References**:
  - `src/parser/frameworkParser.ts:76-77` — Vue script extraction regex using .match()
  - `src/parser/frameworkParser.ts:110-111` — Svelte script extraction
  - `src/parser/frameworkParser.ts:183-225` — `insertImportsIntoFramework()` — MUST verify still works with multi-script
  - `src/__tests__/frameworkParser.test.ts` — existing tests for Vue/Svelte extraction
  - `tests/framework-samples/` — fixture files for framework testing

  **Acceptance Criteria**:
  - [ ] Vue `<script setup>` + `<script>` both extracted
  - [ ] Svelte dual-script both extracted
  - [ ] Single script still works
  - [ ] Import insertion targets correct script tag
  - [ ] `npx tsc --noEmit` = 0 errors
  - [ ] `npm test -- --testPathPattern='frameworkParser' --verbose` = all PASS

  **QA Scenarios**:

  ```
  Scenario: Multiple script tags extracted from Vue file
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='frameworkParser' --testNamePattern='multiple|dual|script' --verbose`
    Expected Result: Multi-script tests pass, existing tests unaffected
    Evidence: .sisyphus/evidence/task-6-multi-script.txt

  Scenario: Import insertion into correct script tag
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='frameworkParser' --testNamePattern='insert' --verbose`
    Expected Result: Imports inserted into <script setup> when present
    Evidence: .sisyphus/evidence/task-6-insertion.txt
  ```

  **Commit**: YES
  - Message: `fix(#75): extract all script tags from Vue/Svelte files`
  - Files: `src/parser/frameworkParser.ts`, `src/__tests__/frameworkParser.test.ts`
  - Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='frameworkParser'`

---

- [x] 7. Fix #79: Re-exports not resolved in export cache [HIGH-PRIORITY]

  **What to do**:
  - In `src/plugins/jsTsPlugin.ts` `parseExports()`: Add regex patterns for:
    1. `export * from './module'` — namespace re-export (follow the source to get exports)
    2. `export { X, Y } from './module'` — named re-exports (record X, Y as exports of THIS file)
    3. `export { default as Foo } from './module'` — default re-export with alias
    4. `export type { MyType } from './types'` — type re-exports (mark isType: true)
  - In `src/resolver/importResolver.ts` `buildExportCache()`: When processing re-exports:
    - For named re-exports: record each name as an export of the barrel file
    - For `export *`: resolve the source file and copy its exports to the barrel file's cache entry
    - Limit re-export resolution to 1 level (no transitive chains)
  - If `ExportInfo` needs a new field (e.g. `reExportSource`), use `lsp_find_references` to find ALL consumers and update them in this same task.
  - Add regression tests in `jsTsPlugin.test.ts`:
    - Test: `export * from './utils'` — exports from utils appear in barrel file cache
    - Test: `export { Button } from './Button'` — Button recorded as export
    - Test: `export { default as MainButton } from './Button'` — MainButton recorded
    - Test: Regular non-re-export exports STILL work

  **Must NOT do**:
  - No transitive re-export resolution (A→B→C)
  - No circular dependency detection
  - Do not modify the `resolveImport()` matching logic — only the cache building

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
    - This is the highest-priority bug. Barrel files are broken without this. Requires careful regex + resolver changes.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T6, T8)
  - **Blocks**: T9 (#88 collision resolution depends on re-exports being in cache)
  - **Blocked By**: T2 (#74 type-only — needed so `export type { X } from` is parsed correctly)

  **References**:
  - `src/plugins/jsTsPlugin.ts:63-75` — current export regex patterns (no re-export handling)
  - `src/resolver/importResolver.ts:40-75` — `buildExportCache()` method
  - `src/resolver/importResolver.ts:77-92` — `resolveImport()` method (read-only reference)
  - `src/__tests__/jsTsPlugin.test.ts` — existing parseExports tests
  - `src/__tests__/importResolver.test.ts` — existing cache tests
  - `src/plugins/languagePlugin.ts:4-15` — LanguagePlugin interface (ExportInfo type)

  **Acceptance Criteria**:
  - [ ] `export * from './module'` populates cache with source's exports
  - [ ] `export { X } from './module'` records X in barrel file's cache
  - [ ] `export { default as Foo } from './module'` records Foo
  - [ ] `export type { T } from './types'` records T with isType: true
  - [ ] Existing non-re-export parsing unaffected
  - [ ] `npx tsc --noEmit` = 0 errors
  - [ ] `npm test -- --testPathPattern='(jsTsPlugin|importResolver)' --verbose` = all PASS

  **QA Scenarios**:

  ```
  Scenario: Re-exports populate export cache
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='(jsTsPlugin|importResolver)' --testNamePattern='re-export|barrel|export.*from' --verbose`
    Expected Result: All new re-export tests pass
    Evidence: .sisyphus/evidence/task-7-re-exports.txt

  Scenario: Existing export detection unaffected
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='jsTsPlugin' --verbose`
    Expected Result: All 50+ existing tests still pass
    Evidence: .sisyphus/evidence/task-7-no-regression.txt
  ```

  **Commit**: YES
  - Message: `fix(#79): resolve re-exports in export cache`
  - Files: `src/plugins/jsTsPlugin.ts`, `src/resolver/importResolver.ts`, test files
  - Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='(jsTsPlugin|importResolver)'`

---

- [x] 8. Fix #87 (CJS part): CommonJS module.exports detection

  **What to do**:
  - In `src/plugins/jsTsPlugin.ts` `parseExports()`: Add regex patterns for:
    1. `module.exports = { name1, name2 }` — destructured object export
    2. `module.exports = ClassName` — single default export
    3. `exports.name = value` — named export
  - Only activate CJS detection for `.js` and `.cjs` files (not `.ts` — TypeScript uses ESM).
  - Add regression tests in `jsTsPlugin.test.ts`:
    - Test: `module.exports = { foo, bar }` — captures foo, bar as exports
    - Test: `module.exports = MyClass` — captures MyClass as default
    - Test: `exports.helper = function(){}` — captures helper
    - Test: ESM exports in .ts files STILL work (no interference)

  **Must NOT do**:
  - No require() detection (that's import-side, not export-side)
  - No dynamic exports: `module.exports[key] = value`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T6, T7)
  - **Blocks**: None
  - **Blocked By**: T1

  **References**:
  - `src/plugins/jsTsPlugin.ts:63-75` — export detection section
  - `src/__tests__/jsTsPlugin.test.ts` — existing export detection tests

  **Acceptance Criteria**:
  - [ ] `module.exports = { foo, bar }` detects foo, bar
  - [ ] `exports.helper = ...` detects helper
  - [ ] ESM exports unaffected
  - [ ] `npx tsc --noEmit` = 0 errors
  - [ ] `npm test -- --testPathPattern='jsTsPlugin' --verbose` = all PASS

  **QA Scenarios**:

  ```
  Scenario: CommonJS exports detected
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='jsTsPlugin' --testNamePattern='commonjs|module.exports|cjs' --verbose`
    Expected Result: New CJS export tests pass
    Evidence: .sisyphus/evidence/task-8-commonjs.txt
  ```

  **Commit**: YES
  - Message: `fix(#87): detect CommonJS module.exports`
  - Files: `src/plugins/jsTsPlugin.ts`, `src/__tests__/jsTsPlugin.test.ts`
  - Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='jsTsPlugin'`

---

- [x] 9. Fix #88: Collision resolution for same-name exports

  **What to do**:
  - In `src/resolver/importResolver.ts` `resolveImport()` (~lines 77-92): When multiple files export the same name, add a chalk.yellow warning to stderr listing all conflicting sources.
  - Current behavior: silently returns first match. Keep first-match-wins behavior but ADD a warning.
  - Warning format: `Warning: "Button" exported from multiple files: src/components/Button.tsx, src/ui/Button.tsx. Using first match.`
  - Only warn when verbose mode is enabled (pass verbose flag through or check options).
  - Add regression tests in `importResolver.test.ts`:
    - Test: Two files export same name → warning logged (mock console.warn or capture stderr)
    - Test: Two files export same name → first-match returned
    - Test: Unique export name → no warning

  **Must NOT do**:
  - No configurable resolution strategy (no priority system, no user prompts)
  - No proximity heuristic — first-match-wins only
  - No changing the return value of resolveImport (still returns single match)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
    - Requires understanding resolver internals and testing warning output

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential, first in wave)
  - **Blocks**: None
  - **Blocked By**: T7 (#79 — re-exports must be in cache first for collisions to be detectable)

  **References**:
  **Pattern References**:
  - `src/resolver/importResolver.ts:77-92` — `resolveImport()` method with first-match-wins loop
  - `src/resolver/importResolver.ts:40-75` — `buildExportCache()` that populates the cache (read to understand cache structure)
  - `src/cli/autoImportCli.ts` — how verbose/options flow through to resolver

  **Test References**:
  - `src/__tests__/importResolver.test.ts` — existing resolver tests

  **Acceptance Criteria**:
  - [ ] Same-name exports produce warning when verbose=true
  - [ ] First-match-wins behavior unchanged
  - [ ] Unique names produce no warning
  - [ ] `npx tsc --noEmit` = 0 errors
  - [ ] `npm test -- --testPathPattern='importResolver' --verbose` = all PASS

  **QA Scenarios**:

  ```
  Scenario: Collision warning emitted for duplicate export names
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='importResolver' --testNamePattern='collision|duplicate|ambiguous|same.name' --verbose`
      2. Verify new collision tests pass
    Expected Result: Warning test passes, first-match test passes
    Evidence: .sisyphus/evidence/task-9-collision-warning.txt

  Scenario: No warning for unique exports
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='importResolver' --verbose`
    Expected Result: All existing tests pass without warnings
    Evidence: .sisyphus/evidence/task-9-no-false-warning.txt
  ```

  **Commit**: YES
  - Message: `fix(#88): warn on ambiguous same-name exports`
  - Files: `src/resolver/importResolver.ts`, `src/__tests__/importResolver.test.ts`
  - Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='importResolver'`

---

- [x] 10. Fix #90: baseUrl without paths in tsconfig.json

  **What to do**:
  - In `src/resolver/importResolver.ts` `loadPathAliases()` (~lines 151-152): Remove the early return when `compilerOptions.paths` is missing but `compilerOptions.baseUrl` is set.
  - When `baseUrl` is present without `paths`: store baseUrl for use during import resolution so non-relative imports (e.g., `import X from 'utils/helper'`) resolve to `{baseUrl}/utils/helper`.
  - In `resolveImport()`: When a non-relative import path doesn't match any alias, try prepending baseUrl and check if the file exists in the export cache.
  - Add regression tests in `importResolver.test.ts`:
    - Test: tsconfig with `baseUrl: "src"` and no `paths` → `import X from 'utils/helper'` resolves to `src/utils/helper`
    - Test: tsconfig with both `baseUrl` and `paths` → paths take priority
    - Test: tsconfig with neither → no change (regression guard)

  **Must NOT do**:
  - Do not implement Node.js module resolution algorithm (node_modules lookup)
  - Do not resolve baseUrl relative to tsconfig location (use project root)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (can run parallel with T9 in Wave 4)
  - **Parallel Group**: Wave 4
  - **Blocks**: T11 (#91 extends chain depends on correct tsconfig parsing)
  - **Blocked By**: T1 (#101)

  **References**:
  **Pattern References**:
  - `src/resolver/importResolver.ts:145-180` — `loadPathAliases()` function with the early return
  - `src/resolver/importResolver.ts:151-152` — The specific early return line: `if (!compilerOptions.paths) return`
  - `src/resolver/importResolver.ts:77-92` — `resolveImport()` where baseUrl resolution would be added

  **External References**:
  - TypeScript docs: `baseUrl` tells the compiler where to find modules. `import "utils/helper"` resolves to `{baseUrl}/utils/helper.ts`

  **Test References**:
  - `src/__tests__/importResolver.test.ts` — existing alias/path resolution tests

  **Acceptance Criteria**:
  - [ ] `baseUrl: "src"` without `paths` → non-relative imports resolve via baseUrl
  - [ ] `baseUrl` + `paths` → paths aliases take priority over baseUrl
  - [ ] No `baseUrl` or `paths` → behavior unchanged
  - [ ] `npx tsc --noEmit` = 0 errors
  - [ ] `npm test -- --testPathPattern='importResolver' --verbose` = all PASS

  **QA Scenarios**:

  ```
  Scenario: baseUrl resolves non-relative imports
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='importResolver' --testNamePattern='baseUrl|base.?url' --verbose`
    Expected Result: baseUrl resolution tests pass
    Evidence: .sisyphus/evidence/task-10-baseurl.txt
  ```

  **Commit**: YES
  - Message: `fix(#90): handle baseUrl without paths in tsconfig`
  - Files: `src/resolver/importResolver.ts`, `src/__tests__/importResolver.test.ts`
  - Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='importResolver'`

---

- [ ] 11. Fix #91: Follow tsconfig extends chain

  **What to do**:
  - In `src/resolver/importResolver.ts` `loadPathAliases()`: Before reading `compilerOptions`, implement `extends` chain resolution:
    1. Read the tsconfig.json file
    2. If `"extends"` field exists (string value only, NOT array):
       a. Resolve the extended config path relative to the current tsconfig's directory
       b. Read the parent config
       c. Merge: child overrides parent for `compilerOptions.paths` and `compilerOptions.baseUrl`
       d. Follow chain up to 5 levels deep (guard against infinite loops)
    3. Use the final merged compilerOptions
  - Handle common extends targets: `./tsconfig.base.json`, `@tsconfig/node18/tsconfig.json` (resolve from node_modules)
  - Add regression tests in `importResolver.test.ts`:
    - Test: child tsconfig extends base with paths → paths from base inherited
    - Test: child overrides parent's baseUrl → child wins
    - Test: 3-level chain → all merged correctly
    - Test: No extends field → works as before (regression guard)
    - Test: extends chain > 5 levels → stops at 5, uses what it has

  **Must NOT do**:
  - No array `extends` (TypeScript 5.0+ feature) — string `extends` only
  - No TypeScript project references (`references` field)
  - No `exclude`/`include` inheritance (only `compilerOptions`)
  - No circular extends detection beyond the 5-level depth limit

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
    - Requires understanding config merging semantics and testing multi-file fixtures

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after T10)
  - **Blocks**: None
  - **Blocked By**: T10 (#90 — baseUrl handling must work before extends inherits it)

  **References**:
  **Pattern References**:
  - `src/resolver/importResolver.ts:145-180` — `loadPathAliases()` to modify
  - `src/resolver/importResolver.ts:151-152` — current early return that ignores inheritance

  **External References**:
  - TypeScript handbook: `extends` in tsconfig.json — child inherits and can override parent
  - Common pattern: monorepo `tsconfig.base.json` with shared paths

  **Test References**:
  - `src/__tests__/importResolver.test.ts` — existing path alias tests
  - `tests/` directory — may need fixture tsconfig files for chain testing

  **Acceptance Criteria**:
  - [ ] Child inherits paths from parent via `extends`
  - [ ] Child overrides parent's compilerOptions when both define same key
  - [ ] 3-level chain resolves correctly
  - [ ] Chain stops at 5 levels (no infinite loop)
  - [ ] No `extends` → behavior unchanged
  - [ ] `npx tsc --noEmit` = 0 errors
  - [ ] `npm test -- --testPathPattern='importResolver' --verbose` = all PASS

  **QA Scenarios**:

  ```
  Scenario: Extends chain resolves inherited paths
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='importResolver' --testNamePattern='extends|inherit|chain' --verbose`
    Expected Result: All extends chain tests pass
    Evidence: .sisyphus/evidence/task-11-extends-chain.txt

  Scenario: Deep chain stops at limit
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='importResolver' --testNamePattern='depth|limit|level' --verbose`
    Expected Result: 5+ level chain test passes (stops gracefully)
    Evidence: .sisyphus/evidence/task-11-depth-limit.txt
  ```

  **Commit**: YES
  - Message: `fix(#91): follow tsconfig extends chain`
  - Files: `src/resolver/importResolver.ts`, `src/__tests__/importResolver.test.ts`
  - Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='importResolver'`

---

- [ ] 12. Fix #80: Elixir multi-alias syntax not parsed

  **What to do**:
  - In `src/plugins/elixirPlugin.ts` (~line 13): Add regex for multi-alias syntax: `alias Foo.{Bar, Baz}` should be expanded to `Foo.Bar` and `Foo.Baz`.
  - Pattern: `/alias\s+([\w.]+)\.\{([^}]+)\}/g` — capture base module and comma-separated suffixes.
  - Split suffixes by comma, trim whitespace, combine with base to produce full module names.
  - Add regression tests in `elixirPlugin.test.ts`:
    - Test: `alias Foo.{Bar, Baz}` → detects both `Foo.Bar` and `Foo.Baz` as imports
    - Test: `alias Foo.Bar` → still works (single alias, regression guard)
    - Test: `alias Foo.{Bar}` → single item in braces works

  **Must NOT do**:
  - Do not handle nested multi-alias: `alias Foo.{Bar.{X, Y}}` (not valid Elixir)
  - Do not modify Go/Rust/Python plugins

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T13-T19)
  - **Blocks**: None
  - **Blocked By**: T1

  **References**:
  - `src/plugins/elixirPlugin.ts:13` — current alias regex (single-alias only)
  - `src/__tests__/elixirPlugin.test.ts` — existing Elixir tests

  **Acceptance Criteria**:
  - [ ] `alias Foo.{Bar, Baz}` detects both imports
  - [ ] Single alias still works
  - [ ] `npx tsc --noEmit` = 0 errors
  - [ ] `npm test -- --testPathPattern='elixirPlugin' --verbose` = all PASS

  **QA Scenarios**:

  ```
  Scenario: Multi-alias syntax parsed correctly
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='elixirPlugin' --testNamePattern='multi.?alias|brace' --verbose`
    Expected Result: Multi-alias tests pass
    Evidence: .sisyphus/evidence/task-12-elixir-multi-alias.txt
  ```

  **Commit**: YES
  - Message: `fix(#80): parse Elixir multi-alias syntax`
  - Files: `src/plugins/elixirPlugin.ts`, `src/__tests__/elixirPlugin.test.ts`
  - Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='elixirPlugin'`

---

- [ ] 13. Fix #81: Python conditional imports not detected

  **What to do**:
  - In `src/plugins/pythonPlugin.ts`: The import regexes use `^` anchor requiring imports at start of line. Indented imports inside `try:` or `if:` blocks are missed.
  - Replace `^import\s+` with `^\s*import\s+` and `^from\s+` with `^\s*from\s+` (allow leading whitespace) in all import detection regexes.
  - Use the `m` (multiline) flag if not already set so `^` matches start of each line.
  - Add regression tests in `pythonPlugin.test.ts`:
    - Test: `try:\n    import ujson as json\nexcept ImportError:\n    import json` → detects both imports
    - Test: `if sys.version_info >= (3, 11):\n    import tomllib` → detects tomllib
    - Test: Top-level `import os` → still works (regression guard)

  **Must NOT do**:
  - Do not parse Python AST or handle complex conditional logic
  - Do not modify Elixir/Rust/Go plugins

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T12, T14-T19)
  - **Blocks**: None
  - **Blocked By**: T1

  **References**:
  - `src/plugins/pythonPlugin.ts` — import detection regexes with `^` anchor
  - `src/__tests__/pythonPlugin.test.ts` — existing Python tests

  **Acceptance Criteria**:
  - [ ] Indented `import` inside try/if blocks detected
  - [ ] Indented `from X import Y` inside try/if blocks detected
  - [ ] Top-level imports still work
  - [ ] `npx tsc --noEmit` = 0 errors
  - [ ] `npm test -- --testPathPattern='pythonPlugin' --verbose` = all PASS

  **QA Scenarios**:

  ```
  Scenario: Conditional imports detected
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='pythonPlugin' --testNamePattern='conditional|try|indent' --verbose`
    Expected Result: Conditional import tests pass
    Evidence: .sisyphus/evidence/task-13-python-conditional.txt
  ```

  **Commit**: YES
  - Message: `fix(#81): detect Python conditional imports`
  - Files: `src/plugins/pythonPlugin.ts`, `src/__tests__/pythonPlugin.test.ts`
  - Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='pythonPlugin'`

---

- [ ] 14. Fix #82: Python relative imports not supported

  **What to do**:
  - In `src/plugins/pythonPlugin.ts`: The from-import regex uses `[\w.]+` for the module name which doesn't match leading dots in relative imports like `from .module import X` or `from ..utils import Y`.
  - Update regex to: `from\s+(\.{0,3}[\w.]*?)\s+import` — allow 0-3 leading dots.
  - Ensure `from . import X` (bare dot) also works.
  - Add regression tests in `pythonPlugin.test.ts`:
    - Test: `from .module import X` → detects import from `.module`
    - Test: `from ..utils import helper` → detects import from `..utils`
    - Test: `from . import X` → detects import from `.`
    - Test: `from os.path import join` → still works (regression guard)

  **Must NOT do**:
  - Do not resolve relative imports to absolute paths (that's resolver scope)
  - Do not modify other language plugins

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T12, T13, T15-T19)
  - **Blocks**: None
  - **Blocked By**: T1

  **References**:
  - `src/plugins/pythonPlugin.ts` — from-import regex with `[\w.]+` pattern
  - `src/__tests__/pythonPlugin.test.ts` — existing Python import tests

  **Acceptance Criteria**:
  - [ ] `from .module import X` detected
  - [ ] `from ..utils import Y` detected
  - [ ] `from . import X` detected
  - [ ] Absolute `from os.path import join` still works
  - [ ] `npx tsc --noEmit` = 0 errors
  - [ ] `npm test -- --testPathPattern='pythonPlugin' --verbose` = all PASS

  **QA Scenarios**:

  ```
  Scenario: Relative imports parsed correctly
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='pythonPlugin' --testNamePattern='relative|dot.import' --verbose`
    Expected Result: Relative import tests pass
    Evidence: .sisyphus/evidence/task-14-python-relative.txt
  ```

  **Commit**: YES
  - Message: `fix(#82): support Python relative imports`
  - Files: `src/plugins/pythonPlugin.ts`, `src/__tests__/pythonPlugin.test.ts`
  - Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='pythonPlugin'`

---

- [ ] 15. Fix #83: Python f-string expression identifiers missed

  **What to do**:
  - In `src/plugins/pythonPlugin.ts` (~line 42): The docstring/string stripping logic removes f-strings entirely, losing identifiers used inside `{expr}` in f-strings.
  - Before stripping f-strings: extract all `{...}` expression contents from f-string literals and include them in identifier detection.
  - Pattern: find `f"...{expr}..."` or `f'...{expr}...'`, extract `expr` parts, feed them through identifier detection.
  - Add regression tests in `pythonPlugin.test.ts`:
    - Test: `f"Hello {name}"` → `name` detected as used identifier
    - Test: `f"{obj.method()}"` → `obj` detected (not `method` — it's a member)
    - Test: `f"literal only"` → no identifiers extracted
    - Test: Regular string `"not f-string {x}"` → `x` NOT extracted

  **Must NOT do**:
  - Do not implement full Python expression parsing inside f-strings
  - Do not handle nested f-strings `f"{f'{x}'}"` (extremely rare)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T12-T14, T16-T19)
  - **Blocks**: None
  - **Blocked By**: T1

  **References**:
  - `src/plugins/pythonPlugin.ts:42` — string/docstring stripping logic
  - `src/__tests__/pythonPlugin.test.ts` — existing Python identifier tests

  **Acceptance Criteria**:
  - [ ] `f"Hello {name}"` detects `name`
  - [ ] `f"{obj.method()}"` detects `obj`
  - [ ] Regular strings don't extract identifiers from braces
  - [ ] `npx tsc --noEmit` = 0 errors
  - [ ] `npm test -- --testPathPattern='pythonPlugin' --verbose` = all PASS

  **QA Scenarios**:

  ```
  Scenario: F-string identifiers detected
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='pythonPlugin' --testNamePattern='f.string|fstring' --verbose`
    Expected Result: F-string identifier tests pass
    Evidence: .sisyphus/evidence/task-15-python-fstring.txt
  ```

  **Commit**: YES
  - Message: `fix(#83): analyze Python f-string expressions`
  - Files: `src/plugins/pythonPlugin.ts`, `src/__tests__/pythonPlugin.test.ts`
  - Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='pythonPlugin'`

---

- [ ] 16. Fix #84: Rust nested multiline use trees not parsed

  **What to do**:
  - In `src/plugins/rustPlugin.ts` (~line 14): The current `use` statement regex only handles single-line `use path::{A, B};`. Multiline and nested `use` trees like `use std::{io::{self, Read}, fs};` are not matched.
  - Replace single regex with a stateful parser or multi-pass approach:
    1. First pass: find `use ` keyword and collect everything until `;` (handling multiline)
    2. Second pass: recursively expand nested braces into individual import paths
  - Support patterns:
    - `use std::{io, fs};` → `std::io`, `std::fs`
    - `use std::{io::{self, Read}, fs};` → `std::io`, `std::io::Read`, `std::fs`
    - Multiline spanning 2-5 lines
  - Add regression tests in `rustPlugin.test.ts`:
    - Test: `use std::{io, fs};` → detects both
    - Test: nested `use std::{io::{self, Read}, fs};` → detects all 3
    - Test: multiline `use` spanning 3 lines
    - Test: Simple `use std::io;` → still works (regression guard)

  **Must NOT do**:
  - Do not handle `use` inside function bodies (module-level only)
  - Do not handle `pub use` re-exports (separate concern)
  - Do not modify other language plugins

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
    - Requires stateful parsing beyond simple regex — needs careful brace matching logic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T12-T15, T17-T19)
  - **Blocks**: None
  - **Blocked By**: T1

  **References**:
  - `src/plugins/rustPlugin.ts:14` — current use statement regex
  - `src/__tests__/rustPlugin.test.ts` — existing Rust tests

  **Acceptance Criteria**:
  - [ ] `use std::{io, fs};` detects both paths
  - [ ] Nested braces `use std::{io::{self, Read}, fs};` detects all paths
  - [ ] Multiline `use` blocks parsed
  - [ ] Simple `use path;` still works
  - [ ] `npx tsc --noEmit` = 0 errors
  - [ ] `npm test -- --testPathPattern='rustPlugin' --verbose` = all PASS

  **QA Scenarios**:

  ```
  Scenario: Nested use trees parsed
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='rustPlugin' --testNamePattern='nested|multiline|tree' --verbose`
    Expected Result: Nested and multiline use tests pass
    Evidence: .sisyphus/evidence/task-16-rust-use-trees.txt
  ```

  **Commit**: YES
  - Message: `fix(#84): parse Rust nested multiline use trees`
  - Files: `src/plugins/rustPlugin.ts`, `src/__tests__/rustPlugin.test.ts`
  - Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='rustPlugin'`

---

- [ ] 17. Fix #85: Rust macro_rules! exports not detected

  **What to do**:
  - In `src/plugins/rustPlugin.ts`: Add regex to detect `#[macro_export]` followed by `macro_rules! name`. The macro name should be added to exports.
  - Pattern: `/#\[macro_export\]\s*macro_rules!\s+(\w+)/g`
  - Also handle `pub macro name` (nightly feature, but simple regex).
  - Add regression tests in `rustPlugin.test.ts`:
    - Test: `#[macro_export]\nmacro_rules! my_macro { ... }` → `my_macro` as export
    - Test: `macro_rules! private_macro { ... }` (no #[macro_export]) → NOT exported
    - Test: Regular `pub fn` exports still work (regression guard)

  **Must NOT do**:
  - Do not parse macro bodies
  - Do not handle `macro_rules!` without `#[macro_export]` (those are private to the crate)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T12-T16, T18-T19)
  - **Blocks**: None
  - **Blocked By**: T1

  **References**:
  - `src/plugins/rustPlugin.ts` — export detection section
  - `src/__tests__/rustPlugin.test.ts` — existing Rust export tests

  **Acceptance Criteria**:
  - [ ] `#[macro_export] macro_rules! name` detected as export
  - [ ] Private `macro_rules!` not exported
  - [ ] Regular exports unaffected
  - [ ] `npx tsc --noEmit` = 0 errors
  - [ ] `npm test -- --testPathPattern='rustPlugin' --verbose` = all PASS

  **QA Scenarios**:

  ```
  Scenario: Macro exports detected
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='rustPlugin' --testNamePattern='macro' --verbose`
    Expected Result: Macro export tests pass
    Evidence: .sisyphus/evidence/task-17-rust-macros.txt
  ```

  **Commit**: YES
  - Message: `fix(#85): track Rust macro_rules! exports`
  - Files: `src/plugins/rustPlugin.ts`, `src/__tests__/rustPlugin.test.ts`
  - Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='rustPlugin'`

---

- [ ] 18. Fix #86: Go dot imports and blank imports not recognized

  **What to do**:
  - In `src/plugins/goPlugin.ts` (~line 18): The import line regex requires `\w+` alias which doesn't match `.` (dot import) or `_` (blank import).
  - Update regex to handle:
    - `import . "fmt"` — dot import (all exports available without qualifier)
    - `import _ "image/png"` — blank import (side-effect only)
    - `import "fmt"` — no alias (existing, should still work)
    - `import f "fmt"` — named alias (existing, should still work)
  - Dot imports should be treated as "everything from this package is in scope".
  - Blank imports should be recognized and NOT flagged as missing.
  - Add regression tests in `goPlugin.test.ts`:
    - Test: `import . "fmt"` → recognized as dot import
    - Test: `import _ "image/png"` → recognized as blank import
    - Test: `import "fmt"` → still works (regression guard)
    - Test: `import f "fmt"` → still works (regression guard)

  **Must NOT do**:
  - Do not implement Go package resolution (resolving which exports a dot-imported package provides)
  - Do not modify other language plugins

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T12-T17, T19)
  - **Blocks**: None
  - **Blocked By**: T1

  **References**:
  - `src/plugins/goPlugin.ts:18` — import line regex
  - `src/__tests__/goPlugin.test.ts` — existing Go tests

  **Acceptance Criteria**:
  - [ ] Dot import `import . "fmt"` recognized
  - [ ] Blank import `import _ "image/png"` recognized
  - [ ] Regular imports still work
  - [ ] `npx tsc --noEmit` = 0 errors
  - [ ] `npm test -- --testPathPattern='goPlugin' --verbose` = all PASS

  **QA Scenarios**:

  ```
  Scenario: Dot and blank imports recognized
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='goPlugin' --testNamePattern='dot|blank|underscore' --verbose`
    Expected Result: Dot and blank import tests pass
    Evidence: .sisyphus/evidence/task-18-go-imports.txt
  ```

  **Commit**: YES
  - Message: `fix(#86): recognize Go dot and blank imports`
  - Files: `src/plugins/goPlugin.ts`, `src/__tests__/goPlugin.test.ts`
  - Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='goPlugin'`

---

- [ ] 19. Fix #87 (Elixir part): Elixir defimpl detection

  **What to do**:
  - In `src/plugins/elixirPlugin.ts`: Add regex to detect `defimpl` protocol implementations as exports.
  - Pattern: `/defimpl\s+([\w.]+)/g` — captures the module name after defimpl.
  - `defimpl MyProtocol, for: SomeType do ... end` → detect `MyProtocol` as a module providing exports.
  - Add regression tests in `elixirPlugin.test.ts`:
    - Test: `defimpl String.Chars, for: MyStruct do` → detects `String.Chars` as implementation
    - Test: `defmodule Foo do` → still works (regression guard)
    - Test: `defimpl` without module name → skipped gracefully

  **Must NOT do**:
  - Do not parse the body of defimpl blocks
  - Do not resolve protocol dispatch (which implementation is called for which type)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T12-T18)
  - **Blocks**: None
  - **Blocked By**: T1

  **References**:
  - `src/plugins/elixirPlugin.ts` — export detection section
  - `src/__tests__/elixirPlugin.test.ts` — existing Elixir export tests

  **Acceptance Criteria**:
  - [ ] `defimpl ModuleName` detected as export
  - [ ] `defmodule` still works
  - [ ] `npx tsc --noEmit` = 0 errors
  - [ ] `npm test -- --testPathPattern='elixirPlugin' --verbose` = all PASS

  **QA Scenarios**:

  ```
  Scenario: defimpl modules detected
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='elixirPlugin' --testNamePattern='defimpl|protocol' --verbose`
    Expected Result: defimpl tests pass
    Evidence: .sisyphus/evidence/task-19-elixir-defimpl.txt
  ```

  **Commit**: YES
  - Message: `fix(#87): detect Elixir defimpl modules`
  - Files: `src/plugins/elixirPlugin.ts`, `src/__tests__/elixirPlugin.test.ts`
  - Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='elixirPlugin'`

---

- [ ] 20. Fix #103: Setup wizard config overwrite check

  **What to do**:
  - In `src/cli/setupWizard.ts` (~line 132): Before calling `fs.writeFile('.import-pilot.json', ...)`, check if `.import-pilot.json` already exists using `fs.existsSync()`.
  - If file exists: prompt user to confirm overwrite OR skip with a warning message: `chalk.yellow('Config file .import-pilot.json already exists. Use --force to overwrite.')`
  - Since we cannot test interactive prompts (TTY mocking out of scope), use the simpler approach: check existence and warn, then skip unless a `--force` flag is set.
  - If `--force` is not part of the wizard, simply log warning and skip the write.
  - Add regression tests in `setupWizard.test.ts`:
    - Test: Config file doesn't exist → created normally
    - Test: Config file already exists → skip with warning (mock fs.existsSync to return true)
    - Test: Existing behavior for other wizard steps unchanged

  **Must NOT do**:
  - No interactive prompt for overwrite confirmation (TTY mocking out of scope)
  - No backup of existing config file
  - No --force flag implementation (just warn and skip)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (solo)
  - **Blocks**: None
  - **Blocked By**: T1

  **References**:
  - `src/cli/setupWizard.ts:132` — the fs.writeFile call for config
  - `src/__tests__/setupWizard.test.ts` — existing wizard tests

  **Acceptance Criteria**:
  - [ ] Existing config file is NOT overwritten
  - [ ] Warning message shown when config exists
  - [ ] New config still created when none exists
  - [ ] `npx tsc --noEmit` = 0 errors
  - [ ] `npm test -- --testPathPattern='setupWizard' --verbose` = all PASS

  **QA Scenarios**:

  ```
  Scenario: Config overwrite prevented
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='setupWizard' --testNamePattern='exist|overwrite|skip' --verbose`
    Expected Result: Overwrite prevention tests pass
    Evidence: .sisyphus/evidence/task-20-wizard-overwrite.txt
  ```

  **Commit**: YES
  - Message: `fix(#103): check existing config before wizard overwrite`
  - Files: `src/cli/setupWizard.ts`, `src/__tests__/setupWizard.test.ts`
  - Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='setupWizard'`

---

- [ ] 21. Add autoImportCli.ts unit tests (coverage gap)

  **What to do**:
  - Create new test file: `src/__tests__/autoImportCli.test.ts`
  - Test the `AutoImportCli` class methods:
    - `run()` method: mock FileScanner, ImportResolver, and plugins. Test that the pipeline executes in correct order.
    - `applyFixes()` method: mock fs.writeFile, test that imports are inserted correctly into file content.
    - Dry-run mode: verify no files are written.
    - Verbose mode: verify additional logging output.
    - Error handling: verify errors in one file don't stop processing of others (especially after T1 fix).
  - Target: >70% statement coverage on autoImportCli.ts
  - Follow existing test patterns from `importResolver.test.ts` for mocking style.

  **Must NOT do**:
  - No integration tests (those are in e2e.test.ts)
  - No testing CLI flag parsing (Commander.js handles that)
  - No mocking of the entire filesystem (mock individual methods)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
    - Requires mocking complex class interactions and understanding the pipeline flow

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with T22, T23)
  - **Blocks**: None
  - **Blocked By**: T1-T20 (all bugs fixed first, so tests run against fixed code)

  **References**:
  **Pattern References**:
  - `src/cli/autoImportCli.ts` — the full class to test (read to understand methods)
  - `src/__tests__/importResolver.test.ts` — mocking patterns to follow
  - `src/__tests__/jsTsPlugin.test.ts` — another test pattern reference

  **API/Type References**:
  - `src/plugins/languagePlugin.ts` — LanguagePlugin interface (mock target)
  - `src/scanner/fileScanner.ts` — FileScanner class (mock target)
  - `src/resolver/importResolver.ts` — ImportResolver class (mock target)

  **Acceptance Criteria**:
  - [ ] `src/__tests__/autoImportCli.test.ts` exists
  - [ ] `npm test -- --testPathPattern='autoImportCli' --verbose` = all PASS
  - [ ] `npm run test:coverage -- --testPathPattern='autoImportCli'` shows >70% statement coverage
  - [ ] `npx tsc --noEmit` = 0 errors

  **QA Scenarios**:

  ```
  Scenario: autoImportCli tests pass with sufficient coverage
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='autoImportCli' --verbose`
      2. Run `npm run test:coverage -- --testPathPattern='autoImportCli' 2>&1 | grep 'autoImportCli'`
      3. Parse coverage output for statement percentage
    Expected Result: All tests pass, >70% statement coverage
    Evidence: .sisyphus/evidence/task-21-cli-tests.txt
  ```

  **Commit**: YES
  - Message: `test: add autoImportCli unit tests`
  - Files: `src/__tests__/autoImportCli.test.ts`
  - Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='autoImportCli'`

---

- [ ] 22. Add fileScanner.ts unit tests (coverage gap)

  **What to do**:
  - Create new test file: `src/__tests__/fileScanner.test.ts`
  - Test the `FileScanner` class methods:
    - `scan()` method: test with temp directory containing various file types. Verify correct files returned.
    - Extension filtering: `.ts`, `.tsx`, `.py`, `.vue`, etc.
    - Ignore patterns: `node_modules/`, `dist/`, custom patterns.
    - Empty directory handling: returns empty array.
    - Symlink handling: doesn't follow symlinks into infinite loops.
    - Content reading: `getFileContent()` returns correct content.
  - Target: >70% statement coverage on fileScanner.ts
  - Use `tmp-promise` or `os.tmpdir()` + `fs.mkdtemp()` for temp dirs.

  **Must NOT do**:
  - No testing on the real project directory (use temp dirs)
  - No testing glob library internals

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with T21, T23)
  - **Blocks**: None
  - **Blocked By**: T1-T20 (all bugs fixed first)

  **References**:
  - `src/scanner/fileScanner.ts` — the class to test
  - `src/__tests__/importResolver.test.ts` — test structure reference

  **Acceptance Criteria**:
  - [ ] `src/__tests__/fileScanner.test.ts` exists
  - [ ] `npm test -- --testPathPattern='fileScanner' --verbose` = all PASS
  - [ ] `npm run test:coverage -- --testPathPattern='fileScanner'` shows >70% statement coverage
  - [ ] `npx tsc --noEmit` = 0 errors

  **QA Scenarios**:

  ```
  Scenario: fileScanner tests pass with sufficient coverage
    Tool: Bash
    Steps:
      1. Run `npm test -- --testPathPattern='fileScanner' --verbose`
      2. Run `npm run test:coverage -- --testPathPattern='fileScanner' 2>&1 | grep 'fileScanner'`
    Expected Result: All tests pass, >70% statement coverage
    Evidence: .sisyphus/evidence/task-22-scanner-tests.txt
  ```

  **Commit**: YES
  - Message: `test: add fileScanner unit tests`
  - Files: `src/__tests__/fileScanner.test.ts`
  - Pre-commit: `npx tsc --noEmit && npm test -- --testPathPattern='fileScanner'`

---

- [ ] 23. Fix #102: E2E file modification tests (beyond dry-run)

  **What to do**:
  - Expand `src/__tests__/e2e.test.ts` (or create `src/__tests__/e2e-modification.test.ts`):
    - Copy `tests/sample-project/` to a temp directory using `fs.cpSync()` or `fs.mkdtempSync()` + copy.
    - Run import-pilot WITHOUT `--dry-run` against the temp directory.
    - Read modified files and assert that expected imports were inserted.
    - Clean up temp directory after test.
  - Test cases:
    - Test: Missing React import in TSX file → `import React from 'react'` inserted
    - Test: Missing named import → correct `import { X } from './path'` inserted
    - Test: Already-imported identifier → NOT re-imported (no duplicates)
    - Test: File with no missing imports → unchanged
  - JS/TS only (Python/Rust/Go/Elixir E2E deferred per guardrails).

  **Must NOT do**:
  - No E2E tests for Python/Rust/Go/Elixir languages
  - No testing on the actual project files (always use temp copies)
  - No testing config file loading (out of scope)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
    - Requires temp dir management, file assertions, and understanding the full pipeline

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with T21, T22)
  - **Blocks**: None
  - **Blocked By**: T1-T20 (all bugs fixed first, so E2E tests verify the fixed tool)

  **References**:
  **Pattern References**:
  - `src/__tests__/e2e.test.ts` — existing E2E test structure (currently dry-run only)
  - `tests/sample-project/` — fixture files for E2E testing

  **API/Type References**:
  - `src/cli/autoImportCli.ts:AutoImportCli.run()` — main entry point
  - `bin/import-pilot.js` — CLI entry for subprocess testing alternative

  **Acceptance Criteria**:
  - [ ] Temp directory created before test, cleaned up after
  - [ ] At least 4 file modification scenarios tested
  - [ ] Actual file content verified (not just CLI output)
  - [ ] No duplicate imports inserted
  - [ ] `npx tsc --noEmit` = 0 errors
  - [ ] `npm run build && npm test -- --testPathPattern='e2e' --verbose` = all PASS

  **QA Scenarios**:

  ```
  Scenario: File modification tests pass
    Tool: Bash
    Steps:
      1. Run `npm run build`
      2. Run `npm test -- --testPathPattern='e2e' --verbose`
      3. Verify new modification tests are in output
    Expected Result: All E2E tests pass including new file modification tests
    Evidence: .sisyphus/evidence/task-23-e2e-modification.txt

  Scenario: No temp directory leaks
    Tool: Bash
    Steps:
      1. Run `ls /tmp/ | grep import-pilot` before test
      2. Run test suite
      3. Run `ls /tmp/ | grep import-pilot` after test
    Expected Result: No import-pilot temp directories remain
    Evidence: .sisyphus/evidence/task-23-no-temp-leak.txt
  ```

  **Commit**: YES
  - Message: `test(#102): add E2E file modification tests`
  - Files: `src/__tests__/e2e.test.ts` or `src/__tests__/e2e-modification.test.ts`
  - Pre-commit: `npm run build && npm test -- --testPathPattern='e2e'`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `npx tsc --noEmit` + `npm test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check for AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Run import-pilot against the project's own codebase: `node bin/import-pilot.js src/ --dry-run --verbose`. Verify no crashes, no false positives on known-good files, and the tool handles each bug scenario correctly. Run against `tests/` fixture directories for each language plugin.
      Output: `Scenarios [N/N pass] | False Positives [N] | Crashes [N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

Each bug fix = exactly one commit for clean `git bisect`:

- T0: `chore: establish green test baseline`
- T1: `fix(#101): add error logging in export cache + protect fs.writeFile`
- T2: `fix(#74): exclude type-only imports from default import matching`
- T3: `fix(#78): handle optional chaining in identifier detection`
- T4: `fix(#76): recognize dynamic import() expressions`
- T5: `fix(#77): detect TypeScript decorator identifiers`
- T6: `fix(#75): extract all script tags from Vue/Svelte files`
- T7: `fix(#79): resolve re-exports in export cache`
- T8: `fix(#87): detect CommonJS module.exports`
- T9: `fix(#88): warn on ambiguous same-name exports`
- T10: `fix(#90): handle baseUrl without paths in tsconfig`
- T11: `fix(#91): follow tsconfig extends chain`
- T12: `fix(#80): parse Elixir multi-alias syntax`
- T13: `fix(#81): detect Python conditional imports`
- T14: `fix(#82): support Python relative imports`
- T15: `fix(#83): analyze Python f-string expressions`
- T16: `fix(#84): parse Rust nested multiline use trees`
- T17: `fix(#85): track Rust macro_rules! exports`
- T18: `fix(#86): recognize Go dot and blank imports`
- T19: `fix(#87): detect Elixir defimpl modules`
- T20: `fix(#103): check existing config before wizard overwrite`
- T21: `test: add autoImportCli unit tests`
- T22: `test: add fileScanner unit tests`
- T23: `test(#102): add E2E file modification tests`

---

## Success Criteria

### Verification Commands

```bash
npm run build                    # Expected: clean build, no errors
npx tsc --noEmit                 # Expected: 0 errors
npm test                         # Expected: ALL tests pass (500+)
npm run test:coverage            # Expected: autoImportCli >70%, fileScanner >70%
node bin/import-pilot.js src/ --dry-run  # Expected: no crashes
```

### Final Checklist

- [ ] All 19 bugs have dedicated regression tests
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (including new ones)
- [ ] `npx tsc --noEmit` = 0 errors
- [ ] One commit per bug fix
