import type { ExportInfo } from '@/resolver/importResolver';
import type { ImportStatement } from '@/parser/astParser';
import type { LanguagePlugin } from '@/plugins/languagePlugin';

// ── Mock functions ───────────────────────────────────────────────────────────
const mockScan = jest.fn();
const mockBuildExportCache = jest.fn();
const mockGetExportCache = jest.fn();

const mockChalkFn = (s: string) => s;
const mockChalk = Object.assign(mockChalkFn, {
  blue: mockChalkFn,
  gray: mockChalkFn,
  green: mockChalkFn,
  yellow: mockChalkFn,
  red: mockChalkFn,
  cyan: mockChalkFn,
});
jest.mock('chalk', () => ({ __esModule: true, default: mockChalk }));

jest.mock('@/scanner/fileScanner', () => ({
  FileScanner: jest.fn(() => ({ scan: mockScan })),
}));

jest.mock('@/resolver/importResolver', () => ({
  ImportResolver: jest.fn(() => ({
    buildExportCache: mockBuildExportCache,
    getExportCache: mockGetExportCache,
  })),
}));

const mockFsReadFile = jest.fn();
jest.mock('fs/promises', () => ({
  readFile: mockFsReadFile,
}));

import { UnusedExportAnalyzer } from '@/analyzer/unusedExportAnalyzer';
import type { UnusedExport } from '@/analyzer/unusedExportAnalyzer';

// ── Helpers ──────────────────────────────────────────────────────────────────
function createMockPlugin(overrides: Partial<LanguagePlugin> = {}): LanguagePlugin {
  return {
    name: 'test-jsts',
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    parseImports: jest.fn(() => []),
    findUsedIdentifiers: jest.fn(() => []),
    parseExports: jest.fn(() => []),
    isBuiltInOrKeyword: jest.fn(() => false),
    generateImportStatement: jest.fn(() => ''),
    getImportInsertPosition: jest.fn(() => 0),
    insertImports: jest.fn((c) => c),
    ...overrides,
  };
}

describe('UnusedExportAnalyzer', () => {
  let analyzer: UnusedExportAnalyzer;
  let mockPlugin: LanguagePlugin;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPlugin = createMockPlugin();
    analyzer = new UnusedExportAnalyzer([mockPlugin]);
  });

  describe('analyze()', () => {
    it('returns empty array when all exports are imported', async () => {
      const exportCache = new Map<string, ExportInfo[]>();
      exportCache.set('/project/src/utils.ts', [
        { name: 'formatName', source: '/project/src/utils.ts', isDefault: false },
      ]);
      mockGetExportCache.mockReturnValue(exportCache);

      const importStatements: ImportStatement[] = [{ source: './utils', imports: ['formatName'], isDefault: false }];
      (mockPlugin.parseImports as jest.Mock).mockReturnValue(importStatements);

      mockScan.mockResolvedValue([
        { path: '/project/src/app.ts', content: 'import { formatName } from "./utils";', ext: '.ts' },
        { path: '/project/src/utils.ts', content: 'export function formatName() {}', ext: '.ts' },
      ]);

      const result = await analyzer.analyze('/project', {});
      expect(result).toEqual([]);
    });

    it('reports exports that are never imported', async () => {
      const exportCache = new Map<string, ExportInfo[]>();
      exportCache.set('/project/src/utils.ts', [
        { name: 'formatName', source: '/project/src/utils.ts', isDefault: false },
        { name: 'unusedHelper', source: '/project/src/utils.ts', isDefault: false },
      ]);
      mockGetExportCache.mockReturnValue(exportCache);

      // app.ts only imports formatName, not unusedHelper
      (mockPlugin.parseImports as jest.Mock).mockImplementation((_content: string, filePath: string) => {
        if (filePath === '/project/src/app.ts') {
          return [{ source: './utils', imports: ['formatName'], isDefault: false }];
        }
        return [];
      });

      mockScan.mockResolvedValue([
        { path: '/project/src/app.ts', content: 'import { formatName } from "./utils";', ext: '.ts' },
        {
          path: '/project/src/utils.ts',
          content: 'export function formatName() {} export function unusedHelper() {}',
          ext: '.ts',
        },
      ]);

      const result = await analyzer.analyze('/project', {});
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'unusedHelper',
        filePath: '/project/src/utils.ts',
        isDefault: false,
      });
    });

    it('excludes index.ts barrel files from unused export detection', async () => {
      const exportCache = new Map<string, ExportInfo[]>();
      exportCache.set('/project/src/index.ts', [
        { name: 'MyComponent', source: '/project/src/index.ts', isDefault: false },
      ]);
      mockGetExportCache.mockReturnValue(exportCache);

      (mockPlugin.parseImports as jest.Mock).mockReturnValue([]);

      mockScan.mockResolvedValue([
        { path: '/project/src/index.ts', content: 'export { MyComponent } from "./MyComponent";', ext: '.ts' },
      ]);

      const result = await analyzer.analyze('/project', {});
      // index.ts is a barrel — its exports should be excluded
      expect(result).toEqual([]);
    });

    it('excludes test files from unused export detection', async () => {
      const exportCache = new Map<string, ExportInfo[]>();
      exportCache.set('/project/src/__tests__/helpers.test.ts', [
        { name: 'testHelper', source: '/project/src/__tests__/helpers.test.ts', isDefault: false },
      ]);
      mockGetExportCache.mockReturnValue(exportCache);

      (mockPlugin.parseImports as jest.Mock).mockReturnValue([]);

      mockScan.mockResolvedValue([
        { path: '/project/src/__tests__/helpers.test.ts', content: 'export function testHelper() {}', ext: '.ts' },
      ]);

      const result = await analyzer.analyze('/project', {});
      expect(result).toEqual([]);
    });

    it('excludes package.json entry points', async () => {
      const exportCache = new Map<string, ExportInfo[]>();
      exportCache.set('/project/src/index.ts', [
        { name: 'AutoImportCli', source: '/project/src/index.ts', isDefault: false },
      ]);
      exportCache.set('/project/bin/import-pilot.js', [
        { name: 'run', source: '/project/bin/import-pilot.js', isDefault: true },
      ]);
      mockGetExportCache.mockReturnValue(exportCache);

      mockFsReadFile.mockResolvedValue(
        JSON.stringify({
          main: './src/index.ts',
          bin: { 'import-pilot': './bin/import-pilot.js' },
        }),
      );

      (mockPlugin.parseImports as jest.Mock).mockReturnValue([]);

      mockScan.mockResolvedValue([
        { path: '/project/src/index.ts', content: 'export { AutoImportCli }', ext: '.ts' },
        { path: '/project/bin/import-pilot.js', content: 'export default run;', ext: '.js' },
      ]);

      const result = await analyzer.analyze('/project', {});
      expect(result).toEqual([]);
    });

    it('handles default imports correctly', async () => {
      const exportCache = new Map<string, ExportInfo[]>();
      exportCache.set('/project/src/Button.tsx', [
        { name: 'Button', source: '/project/src/Button.tsx', isDefault: true },
      ]);
      mockGetExportCache.mockReturnValue(exportCache);

      (mockPlugin.parseImports as jest.Mock).mockImplementation((_content: string, filePath: string) => {
        if (filePath === '/project/src/App.tsx') {
          return [{ source: './Button', imports: ['Button'], isDefault: true }];
        }
        return [];
      });

      mockScan.mockResolvedValue([
        { path: '/project/src/App.tsx', content: 'import Button from "./Button";', ext: '.tsx' },
        { path: '/project/src/Button.tsx', content: 'export default function Button() {}', ext: '.tsx' },
      ]);

      const result = await analyzer.analyze('/project', {});
      expect(result).toEqual([]);
    });

    it('handles namespace imports (import * as x)', async () => {
      const exportCache = new Map<string, ExportInfo[]>();
      exportCache.set('/project/src/utils.ts', [
        { name: 'foo', source: '/project/src/utils.ts', isDefault: false },
        { name: 'bar', source: '/project/src/utils.ts', isDefault: false },
      ]);
      mockGetExportCache.mockReturnValue(exportCache);

      (mockPlugin.parseImports as jest.Mock).mockImplementation((_content: string, filePath: string) => {
        if (filePath === '/project/src/app.ts') {
          return [{ source: './utils', imports: ['utils'], isNamespace: true }];
        }
        return [];
      });

      mockScan.mockResolvedValue([
        { path: '/project/src/app.ts', content: 'import * as utils from "./utils";', ext: '.ts' },
        { path: '/project/src/utils.ts', content: 'export const foo = 1; export const bar = 2;', ext: '.ts' },
      ]);

      const result = await analyzer.analyze('/project', {});
      // Namespace import covers all exports from that module
      expect(result).toEqual([]);
    });

    it('excludes .spec.ts and .test.tsx files', async () => {
      const exportCache = new Map<string, ExportInfo[]>();
      exportCache.set('/project/src/utils.spec.ts', [
        { name: 'mockHelper', source: '/project/src/utils.spec.ts', isDefault: false },
      ]);
      exportCache.set('/project/src/Card.test.tsx', [
        { name: 'renderCard', source: '/project/src/Card.test.tsx', isDefault: false },
      ]);
      mockGetExportCache.mockReturnValue(exportCache);

      (mockPlugin.parseImports as jest.Mock).mockReturnValue([]);
      mockScan.mockResolvedValue([]);

      const result = await analyzer.analyze('/project', {});
      expect(result).toEqual([]);
    });

    it('reports multiple unused exports from different files', async () => {
      const exportCache = new Map<string, ExportInfo[]>();
      exportCache.set('/project/src/a.ts', [{ name: 'alpha', source: '/project/src/a.ts', isDefault: false }]);
      exportCache.set('/project/src/b.ts', [{ name: 'beta', source: '/project/src/b.ts', isDefault: false }]);
      mockGetExportCache.mockReturnValue(exportCache);

      (mockPlugin.parseImports as jest.Mock).mockReturnValue([]);
      mockScan.mockResolvedValue([
        { path: '/project/src/a.ts', content: 'export const alpha = 1;', ext: '.ts' },
        { path: '/project/src/b.ts', content: 'export const beta = 2;', ext: '.ts' },
      ]);

      const result = await analyzer.analyze('/project', {});
      expect(result).toHaveLength(2);
      const names = result.map((r: UnusedExport) => r.name).sort();
      expect(names).toEqual(['alpha', 'beta']);
    });

    it('handles re-exports: export { X } from "..." counts as an import', async () => {
      const exportCache = new Map<string, ExportInfo[]>();
      exportCache.set('/project/src/Button.ts', [
        { name: 'Button', source: '/project/src/Button.ts', isDefault: false },
      ]);
      exportCache.set('/project/src/components.ts', [
        { name: 'Button', source: '/project/src/components.ts', isDefault: false },
      ]);
      mockGetExportCache.mockReturnValue(exportCache);

      // components.ts re-exports Button
      (mockPlugin.parseImports as jest.Mock).mockImplementation((_content: string, filePath: string) => {
        if (filePath === '/project/src/components.ts') {
          return [{ source: './Button', imports: ['Button'], isDefault: false }];
        }
        return [];
      });

      mockScan.mockResolvedValue([
        { path: '/project/src/Button.ts', content: 'export function Button() {}', ext: '.ts' },
        { path: '/project/src/components.ts', content: 'export { Button } from "./Button";', ext: '.ts' },
      ]);

      const result = await analyzer.analyze('/project', {});
      // Button is re-exported by components.ts, so it's used
      const buttonResult = result.filter((r: UnusedExport) => r.filePath === '/project/src/Button.ts');
      expect(buttonResult).toEqual([]);
    });
  });
});
