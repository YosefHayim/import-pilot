# Task 0: Green Baseline Learnings

## Status: COMPLETE ✓

### Build & Test Results

- **Build**: `npm run build` (tsc + tsc-alias) → PASS
- **Tests**: 497 tests → ALL PASS (14 test suites)
  - 39 E2E tests included and passing
  - No test failures
- **TypeCheck**: `npx tsc --noEmit` → 0 errors
- **Artifacts**: `dist/` directory successfully generated with all compiled output

### Key Observations

1. Project is in excellent health — no pre-existing test failures
2. All 497 tests pass on first run after build
3. TypeScript strict mode clean (no type errors)
4. E2E tests depend on `dist/` being present — build must run before tests
5. No source code modifications needed for baseline

### Project Structure Confirmed

- ESM throughout (`"type": "module"`)
- Jest + ts-jest for testing
- tsc-alias for path alias resolution
- 14 test suites covering all major modules
- Plugin architecture working correctly (JS/TS, Python, Go, Rust, Elixir plugins all tested)

### Ready for Bug Fixes

Baseline is green. Ready to proceed with fixing the 19 identified bugs without breaking existing functionality.

## Task 2: Type-only imports (#74)

Regex negative lookahead `(?!type\s)` is the minimal fix to exclude `import type` from all 3 import regex patterns
Must be placed right after `import\s+` in each regex — before the capturing group
3 regexes needed updating: namedImportRegex, defaultImportRegex, namespaceImportRegex
Test count went from 499 → 505 (6 new regression tests)
Pattern: always add regression guards (positive tests) alongside negative tests to ensure regular imports still work

## Task 3: Optional Chaining (#78)

Status: COMPLETE ✓

### The Fix

- **File**: src/parser/astParser.ts (line 100)
- **Change**: Modified negative lookbehind regex from `(?<![.\w])` to `(?<![.?\w])`
- **Impact**: Added `?` to the character class to exclude optional chaining prefix
- **Scope**: 1 character change (minimal, targeted fix)

### Problem Solved

Optional chaining `obj?.method()` was incorrectly capturing `method` as a standalone identifier.
The regex now properly excludes methods preceded by `?.` while maintaining:

- Exclusion of `obj.method()` (dot notation)
- Inclusion of bare `method()` calls

### Tests Added

3 new regression tests in astParser.test.ts:

1. `obj?.method()` → method NOT captured ✓
2. `obj.method()` → method NOT captured (regression guard) ✓
3. `method()` → method IS captured (regression guard) ✓

### Verification

- **TypeScript**: `npx tsc --noEmit` → 0 errors ✓
- **astParser tests**: 19 tests PASS (including 3 new) ✓
- **Full suite**: 508 tests PASS (up from 505) ✓
- **Commit**: f5c3d6d - fix(#78): handle optional chaining in identifier detection ✓

### Key Learning

Negative lookbehind character classes can be extended to exclude multiple characters.
Pattern: `(?<![.?\w])` means "not preceded by `.`, `?`, or word character".
This is more efficient than multiple negative lookaheads.

## Task 4: Fix #76 — Dynamic import() recognition

Adding new import patterns to `parseImports()` is straightforward: add regex, push to `imports[]` array
Dynamic imports use `imports: []` (empty array) since we only track the MODULE path, not specific identifiers
Template literal dynamic imports (`import(\`...\`)`) are naturally excluded by requiring quote chars in the regex
 The regex `/(?:await\s+)?import\s*\(\s*['"]([^'"]+)['"]\s\*\)/g`handles both`await import()`and bare`import()`
Pre-commit hooks (eslint+prettier via lint-staged) may reformat code — commit still succeeds
Test count grew from 508 to 512 (4 new tests added)

## Task 5: Decorator Detection (#77)

Decorator regex belongs in `astParser.ts` `findUsedIdentifiers()`, NOT in `jsTsPlugin.ts`
`jsTsPlugin.findUsedIdentifiers()` just delegates to `astParser.parse().usedIdentifiers`
Regex `/@([A-Z]\w*)/g` correctly captures PascalCase only, skips lowercase like `@deprecated`
The regex naturally stops at `.` so `@Foo.Bar` captures only `Foo` — acceptable
Lines starting with `@` are NOT skipped by the import/export/comment filter (they don't start with those prefixes)
Test count: 512 → 516 (4 new decorator tests added)

## Task 6: Multi-script extraction (issue #75)

`.match()` only captures first regex match; use `.exec()` loop with `/g` flag for ALL matches
Key insight: `scriptContent` serves two purposes: identifier detection (needs ALL blocks) and insertion (needs ONE block). Split these: concatenate for `scriptContent`, use `scriptStart`/`scriptEnd` for insertion target only
`insertImportsIntoFramework` must use `originalContent.substring(scriptStart, scriptEnd)` not the concatenated `scriptContent` to correctly target only the insertion block
Vue convention: `<script setup>` is preferred insertion target over regular `<script>`
Regex `/<script[^>]*>([\s\S]*?)<\/script>/gi` — the `i` flag for case-insensitivity and `g` for global matching
