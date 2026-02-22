import type { LanguagePlugin } from '@/plugins/languagePlugin';

// ── Mock functions (prefix "mock" required for jest.mock() hoisting) ─────────
const mockScan = jest.fn();
const mockBuildExportCache = jest.fn();
const mockResolveImport = jest.fn();
const mockDetectProjectLanguages = jest.fn();
const mockWriteReport = jest.fn();
const mockSortImports = jest.fn();
const mockFsReadFile = jest.fn();
const mockFsWriteFile = jest.fn();

// ── Module mocks ─────────────────────────────────────────────────────────────
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
    resolveImport: mockResolveImport,
  })),
}));

jest.mock('@/detector/languageDetector', () => ({
  detectProjectLanguages: mockDetectProjectLanguages,
}));

jest.mock('@/reporter/reportGenerator', () => ({
  writeReport: mockWriteReport,
}));

jest.mock('@/sorter/importSorter', () => ({
  sortImports: mockSortImports,
}));

jest.mock('fs/promises', () => ({
  readFile: mockFsReadFile,
  writeFile: mockFsWriteFile,
}));

// Import AFTER mocks are declared
import { AutoImportCli } from '@/cli/autoImportCli';

// ── Helpers ──────────────────────────────────────────────────────────────────
function createMockPlugin(overrides: Partial<LanguagePlugin> = {}): LanguagePlugin {
  return {
    name: 'test-jsts',
    extensions: ['.ts', '.tsx'],
    parseImports: jest.fn().mockReturnValue([]),
    findUsedIdentifiers: jest.fn().mockReturnValue([]),
    parseExports: jest.fn().mockReturnValue([]),
    isBuiltInOrKeyword: jest.fn().mockReturnValue(false),
    generateImportStatement: jest.fn((id: string, source: string, isDef: boolean) =>
      isDef ? `import ${id} from '${source}';` : `import { ${id} } from '${source}';`,
    ),
    getImportInsertPosition: jest.fn().mockReturnValue(0),
    insertImports: jest.fn((content: string, imports: string[]) => imports.join('\n') + '\n' + content),
    ...overrides,
  };
}

function allLogOutput(spy: jest.SpyInstance): string {
  return spy.mock.calls.map((c: unknown[]) => (c as string[]).map(String).join(' ')).join('\n');
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('AutoImportCli', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    mockScan.mockResolvedValue([]);
    mockBuildExportCache.mockResolvedValue(undefined);
    mockResolveImport.mockReturnValue(null);
    mockDetectProjectLanguages.mockResolvedValue(['.ts']);
    mockWriteReport.mockResolvedValue(null);
    mockSortImports.mockImplementation((imports: string[]) => imports);
    mockFsReadFile.mockResolvedValue('existing content');
    mockFsWriteFile.mockResolvedValue(undefined);

    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // ── Constructor ──────────────────────────────────────────────────────────

  it('should create instance with custom plugins', () => {
    const cli = new AutoImportCli([createMockPlugin()]);
    expect(cli).toBeDefined();
  });

  it('should create instance with default plugins when none provided', () => {
    const cli = new AutoImportCli();
    expect(cli).toBeDefined();
  });

  // ── Basic flow ───────────────────────────────────────────────────────────

  describe('run() basic flow', () => {
    it('should build export cache and scan directory', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      await cli.run('/project', { extensions: '.ts' });

      expect(mockBuildExportCache).toHaveBeenCalledTimes(1);
      expect(mockScan).toHaveBeenCalledTimes(1);
    });

    it('should handle empty scan results gracefully', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      mockScan.mockResolvedValue([]);

      await cli.run('/project', { extensions: '.ts' });

      expect(mockFsWriteFile).not.toHaveBeenCalled();
      expect(allLogOutput(logSpy)).toContain('Found 0 files');
    });
  });

  // ── Extension handling ───────────────────────────────────────────────────

  describe('extension handling', () => {
    it('should parse comma-separated extensions from options', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      await cli.run('/project', { extensions: '.ts,.tsx' });

      expect(mockScan).toHaveBeenCalledWith(expect.objectContaining({ extensions: ['.ts', '.tsx'] }));
    });

    it('should add leading dot to extensions without one', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      await cli.run('/project', { extensions: 'ts,tsx' });

      expect(mockScan).toHaveBeenCalledWith(expect.objectContaining({ extensions: ['.ts', '.tsx'] }));
    });

    it('should auto-detect extensions when not specified', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      mockDetectProjectLanguages.mockResolvedValue(['.ts', '.py']);

      await cli.run('/project', {});

      // Only .ts is supported by our mock plugin (not .py)
      expect(mockScan).toHaveBeenCalledWith(expect.objectContaining({ extensions: ['.ts'] }));
    });

    it('should fall back to all plugin extensions when detection finds none supported', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      mockDetectProjectLanguages.mockResolvedValue(['.rb']); // unsupported

      await cli.run('/project', {});

      expect(mockScan).toHaveBeenCalledWith(expect.objectContaining({ extensions: ['.ts', '.tsx'] }));
    });

    it('should log auto-detected extensions in verbose mode', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      mockDetectProjectLanguages.mockResolvedValue(['.ts']);

      await cli.run('/project', { verbose: true });

      expect(allLogOutput(logSpy)).toContain('Auto-detected extensions');
    });
  });

  // ── Identifier analysis ──────────────────────────────────────────────────

  describe('identifier analysis', () => {
    it('should skip identifiers already imported', async () => {
      const plugin = createMockPlugin({
        parseImports: jest.fn().mockReturnValue([{ source: './foo', imports: ['Foo'], isDefault: false }]),
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Foo', line: 1, column: 0 }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'code', ext: '.ts' }]);

      await cli.run('/project', { extensions: '.ts' });

      expect(mockResolveImport).not.toHaveBeenCalled();
    });

    it('should skip locally exported identifiers', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'MyFunc', line: 1, column: 0 }]),
        parseExports: jest.fn().mockReturnValue([{ name: 'MyFunc', source: '/project/src/app.ts', isDefault: false }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'code', ext: '.ts' }]);

      await cli.run('/project', { extensions: '.ts' });

      expect(mockResolveImport).not.toHaveBeenCalled();
    });

    it('should skip built-in/keyword identifiers', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Array', line: 1, column: 0 }]),
        isBuiltInOrKeyword: jest.fn().mockReturnValue(true),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'code', ext: '.ts' }]);

      await cli.run('/project', { extensions: '.ts' });

      expect(mockResolveImport).not.toHaveBeenCalled();
    });

    it('should skip files with no matching plugin', async () => {
      const plugin = createMockPlugin({ extensions: ['.ts'] });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([{ path: '/project/src/app.rb', content: 'code', ext: '.rb' }]);

      await cli.run('/project', { extensions: '.ts,.rb' });

      expect(plugin.parseImports).not.toHaveBeenCalled();
    });

    it('should deduplicate used identifiers', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([
          { name: 'Foo', line: 1, column: 0 },
          { name: 'Foo', line: 5, column: 0 },
          { name: 'Foo', line: 10, column: 0 },
        ]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'code', ext: '.ts' }]);

      await cli.run('/project', { extensions: '.ts' });

      // resolveImport should be called only once for 'Foo', not 3 times
      expect(mockResolveImport).toHaveBeenCalledTimes(1);
      expect(mockResolveImport).toHaveBeenCalledWith('Foo', '/project/src/app.ts');
    });
  });

  // ── Dry-run mode ─────────────────────────────────────────────────────────

  describe('dry-run mode', () => {
    it('should not write files in dry-run mode', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Foo', line: 1, column: 0 }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'code', ext: '.ts' }]);
      mockResolveImport.mockReturnValue({ name: 'Foo', source: './foo', isDefault: false });

      await cli.run('/project', { dryRun: true, extensions: '.ts' });

      expect(mockFsWriteFile).not.toHaveBeenCalled();
      expect(allLogOutput(logSpy)).toContain('Dry run mode');
    });
  });

  // ── Normal mode (fixes applied) ──────────────────────────────────────────

  describe('normal mode with fixes', () => {
    it('should apply fixes when resolvable imports found', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Foo', line: 1, column: 0 }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'const x = Foo();', ext: '.ts' }]);
      mockResolveImport.mockReturnValue({ name: 'Foo', source: './foo', isDefault: false });
      mockFsReadFile.mockResolvedValue('const x = Foo();');

      await cli.run('/project', { dryRun: false, extensions: '.ts' });

      expect(mockFsReadFile).toHaveBeenCalledWith('/project/src/app.ts', 'utf-8');
      expect(plugin.generateImportStatement).toHaveBeenCalledWith('Foo', './foo', false);
      expect(plugin.insertImports).toHaveBeenCalled();
      expect(mockFsWriteFile).toHaveBeenCalled();
    });

    it('should handle multiple files with missing imports', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest
          .fn()
          .mockReturnValueOnce([{ name: 'Foo', line: 1, column: 0 }])
          .mockReturnValueOnce([{ name: 'Bar', line: 1, column: 0 }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([
        { path: '/project/src/a.ts', content: 'Foo();', ext: '.ts' },
        { path: '/project/src/b.ts', content: 'Bar();', ext: '.ts' },
      ]);
      mockResolveImport
        .mockReturnValueOnce({ name: 'Foo', source: './foo', isDefault: false })
        .mockReturnValueOnce({ name: 'Bar', source: './bar', isDefault: true });

      await cli.run('/project', { dryRun: false, extensions: '.ts' });

      expect(mockFsWriteFile).toHaveBeenCalledTimes(2);
    });

    it('should log "no resolvable imports" when none can be resolved', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Unknown', line: 1, column: 0 }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'code', ext: '.ts' }]);
      mockResolveImport.mockReturnValue(null);

      await cli.run('/project', { dryRun: false, extensions: '.ts' });

      expect(mockFsWriteFile).not.toHaveBeenCalled();
      expect(allLogOutput(logSpy)).toContain('No resolvable imports found');
    });
  });

  // ── Verbose mode ─────────────────────────────────────────────────────────

  describe('verbose mode', () => {
    it('should log file details and resolved suggestions', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Foo', line: 1, column: 0 }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'code', ext: '.ts' }]);
      mockResolveImport.mockReturnValue({ name: 'Foo', source: './foo', isDefault: false });

      await cli.run('/project', { verbose: true, dryRun: true, extensions: '.ts' });

      const output = allLogOutput(logSpy);
      expect(output).toContain('app.ts');
      expect(output).toContain('Foo');
    });

    it('should log "not found" for unresolved identifiers in verbose mode', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Unknown', line: 1, column: 0 }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'code', ext: '.ts' }]);
      mockResolveImport.mockReturnValue(null);

      await cli.run('/project', { verbose: true, extensions: '.ts' });

      expect(allLogOutput(logSpy)).toContain('not found in project');
    });
  });

  // ── Report generation ────────────────────────────────────────────────────

  describe('report generation', () => {
    it('should call writeReport when report format is specified', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      mockWriteReport.mockResolvedValue('/project/import-pilot-report.md');

      await cli.run('/project', { report: 'md', extensions: '.ts' });

      expect(mockWriteReport).toHaveBeenCalledWith(
        expect.any(String),
        'md',
        expect.objectContaining({
          totalFilesScanned: 0,
          dryRun: false,
          entries: [],
        }),
      );
    });

    it('should log report path when writeReport succeeds', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      mockWriteReport.mockResolvedValue('/project/import-pilot-report.md');

      await cli.run('/project', { report: 'md', extensions: '.ts' });

      expect(allLogOutput(logSpy)).toContain('Report written to');
    });

    it('should not call writeReport when format is none', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);

      await cli.run('/project', { report: 'none', extensions: '.ts' });

      expect(mockWriteReport).not.toHaveBeenCalled();
    });

    it('should not call writeReport when report option is not set', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);

      await cli.run('/project', { extensions: '.ts' });

      expect(mockWriteReport).not.toHaveBeenCalled();
    });

    it('should include report entries for resolved and unresolved identifiers', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([
          { name: 'Foo', line: 1, column: 0 },
          { name: 'Bar', line: 2, column: 0 },
        ]),
      });
      const cli = new AutoImportCli([plugin]);
      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'code', ext: '.ts' }]);
      mockResolveImport
        .mockReturnValueOnce({ name: 'Foo', source: './foo', isDefault: false })
        .mockReturnValueOnce(null);
      mockWriteReport.mockResolvedValue('/project/report.md');

      await cli.run('/project', { report: 'md', dryRun: true, extensions: '.ts' });

      expect(mockWriteReport).toHaveBeenCalledWith(
        expect.any(String),
        'md',
        expect.objectContaining({
          totalMissing: 2,
          totalResolved: 1,
          totalUnresolved: 1,
          entries: expect.arrayContaining([
            expect.objectContaining({ identifier: 'Foo', source: './foo' }),
            expect.objectContaining({ identifier: 'Bar', importStatement: null, source: null }),
          ]),
        }),
      );
    });
  });

  // ── applyFixes error handling ────────────────────────────────────────────

  describe('applyFixes error handling', () => {
    it('should log error and continue when readFile fails', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Foo', line: 1, column: 0 }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'Foo();', ext: '.ts' }]);
      mockResolveImport.mockReturnValue({ name: 'Foo', source: './foo', isDefault: false });
      mockFsReadFile.mockRejectedValue(new Error('Permission denied'));

      await cli.run('/project', { dryRun: false, extensions: '.ts' });

      expect(errorSpy).toHaveBeenCalled();
      const errorOutput = errorSpy.mock.calls.map((c: unknown[]) => (c as string[]).map(String).join(' ')).join('\n');
      expect(errorOutput).toContain('Permission denied');
    });

    it('should continue processing after a file error', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest
          .fn()
          .mockReturnValueOnce([{ name: 'Foo', line: 1, column: 0 }])
          .mockReturnValueOnce([{ name: 'Bar', line: 1, column: 0 }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([
        { path: '/project/src/a.ts', content: 'Foo();', ext: '.ts' },
        { path: '/project/src/b.ts', content: 'Bar();', ext: '.ts' },
      ]);
      mockResolveImport
        .mockReturnValueOnce({ name: 'Foo', source: './foo', isDefault: false })
        .mockReturnValueOnce({ name: 'Bar', source: './bar', isDefault: false });

      // First file fails, second succeeds
      mockFsReadFile.mockRejectedValueOnce(new Error('Permission denied')).mockResolvedValueOnce('Bar();');

      await cli.run('/project', { dryRun: false, extensions: '.ts' });

      // Second file should still be written
      expect(mockFsWriteFile).toHaveBeenCalledTimes(1);
    });

    it('should handle non-Error thrown values', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Foo', line: 1, column: 0 }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'Foo();', ext: '.ts' }]);
      mockResolveImport.mockReturnValue({ name: 'Foo', source: './foo', isDefault: false });
      mockFsReadFile.mockRejectedValue('string error');

      await cli.run('/project', { dryRun: false, extensions: '.ts' });

      expect(errorSpy).toHaveBeenCalled();
    });
  });

  // ── Ignore patterns ──────────────────────────────────────────────────────

  describe('ignore patterns', () => {
    it('should pass parsed ignore patterns to scanner', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);

      await cli.run('/project', { extensions: '.ts', ignore: '**/test/**,**/dist/**' });

      expect(mockScan).toHaveBeenCalledWith(expect.objectContaining({ ignore: ['**/test/**', '**/dist/**'] }));
    });

    it('should pass undefined ignore when not specified', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);

      await cli.run('/project', { extensions: '.ts' });

      expect(mockScan).toHaveBeenCalledWith(expect.objectContaining({ ignore: undefined }));
    });
  });

  // ── Sort control ─────────────────────────────────────────────────────────

  describe('import sorting', () => {
    it('should call sortImports when sort is not disabled', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Foo', line: 1, column: 0 }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'Foo();', ext: '.ts' }]);
      mockResolveImport.mockReturnValue({ name: 'Foo', source: './foo', isDefault: false });

      await cli.run('/project', { dryRun: false, extensions: '.ts' });

      expect(mockSortImports).toHaveBeenCalled();
    });

    it('should not call sortImports when sort is false', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Foo', line: 1, column: 0 }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'Foo();', ext: '.ts' }]);
      mockResolveImport.mockReturnValue({ name: 'Foo', source: './foo', isDefault: false });

      await cli.run('/project', { dryRun: false, extensions: '.ts', sort: false });

      expect(mockSortImports).not.toHaveBeenCalled();
    });

    it('should pass sortOrder to sortImports', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Foo', line: 1, column: 0 }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'Foo();', ext: '.ts' }]);
      mockResolveImport.mockReturnValue({ name: 'Foo', source: './foo', isDefault: false });

      await cli.run('/project', { dryRun: false, extensions: '.ts', sortOrder: 'external,relative' });

      expect(mockSortImports).toHaveBeenCalledWith(expect.any(Array), 'js', 'external,relative');
    });
  });

  // ── getLanguageForExt (private) ──────────────────────────────────────────

  describe('getLanguageForExt', () => {
    it('should return correct language for various extensions', () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      const getLanguageForExt = (cli as any).getLanguageForExt.bind(cli); // eslint-disable-line @typescript-eslint/no-explicit-any

      expect(getLanguageForExt('.py')).toBe('python');
      expect(getLanguageForExt('.ex')).toBe('elixir');
      expect(getLanguageForExt('.exs')).toBe('elixir');
      expect(getLanguageForExt('.go')).toBe('go');
      expect(getLanguageForExt('.rs')).toBe('rust');
      expect(getLanguageForExt('.ts')).toBe('js');
      expect(getLanguageForExt('.tsx')).toBe('js');
      expect(getLanguageForExt('.js')).toBe('js');
      expect(getLanguageForExt('.jsx')).toBe('js');
    });
  });

  // ── Summary output ───────────────────────────────────────────────────────

  describe('summary output', () => {
    it('should log correct summary statistics', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([
          { name: 'Foo', line: 1, column: 0 },
          { name: 'Bar', line: 2, column: 0 },
        ]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'code', ext: '.ts' }]);
      // Foo is resolvable, Bar is not
      mockResolveImport
        .mockReturnValueOnce({ name: 'Foo', source: './foo', isDefault: false })
        .mockReturnValueOnce(null);

      await cli.run('/project', { dryRun: true, extensions: '.ts' });

      const output = allLogOutput(logSpy);
      expect(output).toContain('Total files scanned: 1');
      expect(output).toContain('Files with missing imports: 1');
      expect(output).toContain('Total missing imports: 2');
      expect(output).toContain('Resolvable imports: 1');
    });

    it('should show 0 issues when no files have missing imports', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'code', ext: '.ts' }]);

      await cli.run('/project', { extensions: '.ts' });

      const output = allLogOutput(logSpy);
      expect(output).toContain('Files with missing imports: 0');
      expect(output).toContain('Total missing imports: 0');
    });
  });

  // ── Alias option ─────────────────────────────────────────────────────────

  describe('alias option', () => {
    it('should pass useAliases=true by default to ImportResolver', async () => {
      const { ImportResolver } = jest.requireMock('@/resolver/importResolver') as {
        ImportResolver: jest.Mock;
      };
      const cli = new AutoImportCli([createMockPlugin()]);

      await cli.run('/project', { extensions: '.ts' });

      expect(ImportResolver).toHaveBeenCalledWith(expect.objectContaining({ useAliases: true }));
    });

    it('should pass useAliases=false when alias option is false', async () => {
      const { ImportResolver } = jest.requireMock('@/resolver/importResolver') as {
        ImportResolver: jest.Mock;
      };
      const cli = new AutoImportCli([createMockPlugin()]);

      await cli.run('/project', { extensions: '.ts', alias: false });

      expect(ImportResolver).toHaveBeenCalledWith(expect.objectContaining({ useAliases: false }));
    });
  });
});
