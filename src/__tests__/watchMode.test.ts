import type { LanguagePlugin } from '@/plugins/languagePlugin';

// ── Mock functions ───────────────────────────────────────────────────────────
const mockBuildExportCache = jest.fn();
const mockResolveImport = jest.fn();
const mockDetectProjectLanguages = jest.fn();
const mockFsReadFile = jest.fn();
const mockFsWriteFile = jest.fn();
const mockSortImports = jest.fn();

// ── Chokidar mock ───────────────────────────────────────────────────────────
type WatchHandler = (filePath: string) => void;
const mockWatcherOn = jest.fn();
const mockWatcherClose = jest.fn().mockResolvedValue(undefined);
const mockChokidarWatch = jest.fn(() => ({
  on: mockWatcherOn,
  close: mockWatcherClose,
}));

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
  FileScanner: jest.fn(() => ({ scan: jest.fn() })),
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
  writeReport: jest.fn(),
}));

jest.mock('@/sorter/importSorter', () => ({
  sortImports: mockSortImports,
}));

jest.mock('fs/promises', () => ({
  readFile: mockFsReadFile,
  writeFile: mockFsWriteFile,
}));

jest.mock('chokidar', () => ({
  watch: mockChokidarWatch,
}));

// Import AFTER mocks
import { AutoImportCli, createCli } from '@/cli/autoImportCli';

// ── Helpers ──────────────────────────────────────────────────────────────────
function createMockPlugin(overrides: Partial<LanguagePlugin> = {}): LanguagePlugin {
  return {
    name: 'test-jsts',
    extensions: ['.ts', '.tsx'],
    parseImports: jest.fn().mockReturnValue([]),
    findUsedIdentifiers: jest.fn().mockReturnValue([]),
    parseExports: jest.fn().mockReturnValue([]),
    isBuiltInOrKeyword: jest.fn().mockReturnValue(false),
    generateImportStatement: jest.fn().mockReturnValue("import { Foo } from './foo'"),
    getImportInsertPosition: jest.fn().mockReturnValue(0),
    insertImports: jest.fn().mockReturnValue('// updated content'),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('Watch Mode', () => {
  let consoleSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  const originalProcessOn = process.on;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockDetectProjectLanguages.mockResolvedValue(['.ts', '.tsx']);
    mockBuildExportCache.mockResolvedValue(undefined);
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    // Prevent actual SIGINT handlers from accumulating
    process.on = jest.fn().mockReturnValue(process) as typeof process.on;
  });

  afterEach(() => {
    jest.useRealTimers();
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.on = originalProcessOn;
  });

  describe('watch()', () => {
    it('builds export cache once at startup', async () => {
      const plugin = createMockPlugin();
      const cli = new AutoImportCli([plugin]);

      await cli.watch('/test/project', {});

      expect(mockBuildExportCache).toHaveBeenCalledTimes(1);
    });

    it('returns a cleanup function that closes watcher', async () => {
      const plugin = createMockPlugin();
      const cli = new AutoImportCli([plugin]);

      const cleanup = await cli.watch('/test/project', {});

      expect(typeof cleanup).toBe('function');
      await cleanup();
      expect(mockWatcherClose).toHaveBeenCalledTimes(1);
    });

    it('sets up chokidar watcher with correct globs', async () => {
      const plugin = createMockPlugin({ extensions: ['.ts', '.tsx'] });
      const cli = new AutoImportCli([plugin]);

      await cli.watch('/test/project', { extensions: '.ts,.tsx' });

      expect(mockChokidarWatch).toHaveBeenCalledTimes(1);
      const [globs] = mockChokidarWatch.mock.calls[0] as unknown as [string[]];
      expect(globs).toEqual(expect.arrayContaining([expect.stringContaining('.ts'), expect.stringContaining('.tsx')]));
    });

    it('registers a change listener on the watcher', async () => {
      const plugin = createMockPlugin();
      const cli = new AutoImportCli([plugin]);

      await cli.watch('/test/project', {});

      expect(mockWatcherOn).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('logs watch mode startup messages', async () => {
      const plugin = createMockPlugin();
      const cli = new AutoImportCli([plugin]);

      await cli.watch('/test/project', {});

      const logs = consoleSpy.mock.calls.map((c: unknown[]) => c[0]);
      expect(logs).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Watch Mode'),
          expect.stringContaining('Watching for changes'),
          expect.stringContaining('Ctrl+C'),
        ]),
      );
    });

    it('registers SIGINT handler for clean exit', async () => {
      const plugin = createMockPlugin();
      const cli = new AutoImportCli([plugin]);

      await cli.watch('/test/project', {});

      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    });

    it('passes ignored patterns to chokidar', async () => {
      const plugin = createMockPlugin();
      const cli = new AutoImportCli([plugin]);

      await cli.watch('/test/project', { ignore: '**/*.spec.ts,**/*.test.ts' });

      const [, opts] = mockChokidarWatch.mock.calls[0] as unknown as [string[], { ignored: string[] }];
      expect(opts.ignored).toEqual(expect.arrayContaining(['**/*.spec.ts', '**/*.test.ts']));
    });
  });

  describe('debounced file processing', () => {
    it('debounces rapid changes with 300ms delay', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Foo', line: 1 }]),
      });
      mockResolveImport.mockReturnValue({ source: './foo', isDefault: false });
      mockFsReadFile.mockResolvedValue('const x = Foo();');
      const cli = new AutoImportCli([plugin]);

      await cli.watch('/test/project', { extensions: '.ts' });

      const changeHandler = mockWatcherOn.mock.calls.find((c: unknown[]) => c[0] === 'change')![1] as WatchHandler;

      // Fire multiple rapid changes
      changeHandler('/test/project/a.ts');
      changeHandler('/test/project/a.ts');
      changeHandler('/test/project/a.ts');

      // Before 300ms — nothing processed
      jest.advanceTimersByTime(200);
      await Promise.resolve(); // flush microtasks
      expect(mockFsReadFile).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      await Promise.resolve();
      await jest.runAllTimersAsync();

      // readFile called twice: once in processFile, once in applyFixes — but only for one file (deduplicated)
      expect(mockFsReadFile).toHaveBeenCalledTimes(2);
      expect(mockFsReadFile.mock.calls.every((c: unknown[]) => (c[0] as string).endsWith('a.ts'))).toBe(true);
    });
  });

  describe('processFile()', () => {
    it('returns 0 when no missing imports', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([]),
        parseImports: jest.fn().mockReturnValue([]),
        parseExports: jest.fn().mockReturnValue([]),
      });
      mockFsReadFile.mockResolvedValue('const x = 1;');

      const cli = new AutoImportCli([plugin]);
      // Manually set up the resolver by calling watch first
      await cli.watch('/test/project', { extensions: '.ts' });

      const count = await cli.processFile('/test/project/test.ts', '/test/project');
      expect(count).toBe(0);
    });

    it('returns count of fixable imports', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([
          { name: 'Foo', line: 1 },
          { name: 'Bar', line: 2 },
        ]),
        parseImports: jest.fn().mockReturnValue([]),
        parseExports: jest.fn().mockReturnValue([]),
      });
      mockResolveImport.mockReturnValue({ source: './foo', isDefault: false });
      mockFsReadFile.mockResolvedValue('Foo(); Bar();');
      mockSortImports.mockImplementation((imports: string[]) => imports);

      const cli = new AutoImportCli([plugin]);
      await cli.watch('/test/project', { extensions: '.ts' });

      const count = await cli.processFile('/test/project/test.ts', '/test/project');
      expect(count).toBe(2);
    });

    it('returns 0 for unsupported file extensions', async () => {
      const plugin = createMockPlugin({ extensions: ['.ts'] });
      const cli = new AutoImportCli([plugin]);
      await cli.watch('/test/project', { extensions: '.ts' });

      const count = await cli.processFile('/test/project/readme.md', '/test/project');
      expect(count).toBe(0);
    });

    it('returns 0 when file cannot be read', async () => {
      const plugin = createMockPlugin();
      mockFsReadFile.mockRejectedValue(new Error('ENOENT'));

      const cli = new AutoImportCli([plugin]);
      await cli.watch('/test/project', { extensions: '.ts' });

      const count = await cli.processFile('/test/project/missing.ts', '/test/project');
      expect(count).toBe(0);
    });

    it('does not apply fixes in dry-run mode', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Foo', line: 1 }]),
        parseImports: jest.fn().mockReturnValue([]),
        parseExports: jest.fn().mockReturnValue([]),
      });
      mockResolveImport.mockReturnValue({ source: './foo', isDefault: false });
      mockFsReadFile.mockResolvedValue('Foo();');

      const cli = new AutoImportCli([plugin]);
      await cli.watch('/test/project', { extensions: '.ts' });

      const count = await cli.processFile('/test/project/test.ts', '/test/project', { dryRun: true });
      expect(count).toBe(1);
      expect(mockFsWriteFile).not.toHaveBeenCalled();
    });
  });

  describe('createCli --watch flag', () => {
    it('registers --watch / -w option', () => {
      const program = createCli();
      const watchOption = program.options.find((opt) => opt.long === '--watch');
      expect(watchOption).toBeDefined();
      expect(watchOption!.short).toBe('-w');
    });
  });
});
