import type { LanguagePlugin } from '@/plugins/languagePlugin';

// ── Mock functions ──────────────────────────────────────────────────────────
const mockScan = jest.fn();
const mockBuildExportCache = jest.fn();
const mockResolveImport = jest.fn();
const mockResolveAllImports = jest.fn();
const mockDetectProjectLanguages = jest.fn();
const mockWriteReport = jest.fn();
const mockSortImports = jest.fn();
const mockFsReadFile = jest.fn();
const mockFsWriteFile = jest.fn();
const mockClackSelect = jest.fn();

// ── Module mocks ────────────────────────────────────────────────────────────
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
    resolveAllImports: mockResolveAllImports,
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

jest.mock('@clack/prompts', () => ({
  select: mockClackSelect,
}));

import { AutoImportCli } from '@/cli/autoImportCli';

// ── Helpers ─────────────────────────────────────────────────────────────────
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

describe('Interactive Mode', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    mockScan.mockResolvedValue([]);
    mockBuildExportCache.mockResolvedValue(undefined);
    mockResolveImport.mockReturnValue(null);
    mockResolveAllImports.mockReturnValue([]);
    mockDetectProjectLanguages.mockResolvedValue(['.ts']);
    mockWriteReport.mockResolvedValue(null);
    mockSortImports.mockImplementation((imports: string[]) => imports);
    mockFsReadFile.mockRejectedValue(new Error('ENOENT'));
    mockFsWriteFile.mockResolvedValue(undefined);

    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('should use resolveAllImports when interactive is true and show prompt for multiple matches', async () => {
    const plugin = createMockPlugin({
      findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Button', location: 0 }]),
    });

    mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'Button', ext: '.ts' }]);
    mockResolveAllImports.mockReturnValue([
      { name: 'Button', source: '@/components/ui/Button', isDefault: true },
      { name: 'Button', source: '@/shared/Button', isDefault: false },
    ]);
    mockClackSelect.mockResolvedValue('@/components/ui/Button');

    const cli = new AutoImportCli([plugin]);
    await cli.run('/project', { extensions: '.ts', interactive: true, dryRun: true });

    expect(mockResolveAllImports).toHaveBeenCalledWith('Button', '/project/src/app.ts');
    expect(mockClackSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Button'),
        options: expect.arrayContaining([
          expect.objectContaining({ value: '@/components/ui/Button' }),
          expect.objectContaining({ value: '@/shared/Button' }),
        ]),
      }),
    );
  });

  it('should skip prompt and use single match directly when only one source exists', async () => {
    const plugin = createMockPlugin({
      findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Card', location: 0 }]),
    });

    mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'Card', ext: '.ts' }]);
    mockResolveAllImports.mockReturnValue([{ name: 'Card', source: '@/components/Card', isDefault: true }]);

    const cli = new AutoImportCli([plugin]);
    await cli.run('/project', { extensions: '.ts', interactive: true, dryRun: true });

    expect(mockClackSelect).not.toHaveBeenCalled();
  });

  it('should use saved choice from resolvedImports config without prompting', async () => {
    const plugin = createMockPlugin({
      findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Button', location: 0 }]),
    });

    mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'Button', ext: '.ts' }]);
    mockResolveAllImports.mockReturnValue([
      { name: 'Button', source: '@/components/ui/Button', isDefault: true },
      { name: 'Button', source: '@/shared/Button', isDefault: false },
    ]);

    mockFsReadFile.mockImplementation((filePath: string) => {
      if (typeof filePath === 'string' && filePath.endsWith('.import-pilot.json')) {
        return Promise.resolve(JSON.stringify({ resolvedImports: { Button: '@/components/ui/Button' } }));
      }
      return Promise.resolve('existing content');
    });

    const cli = new AutoImportCli([plugin]);
    await cli.run('/project', { extensions: '.ts', interactive: true, dryRun: true });

    expect(mockClackSelect).not.toHaveBeenCalled();
  });

  it('should save chosen source to config file after interactive selection', async () => {
    const plugin = createMockPlugin({
      findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Icon', location: 0 }]),
    });

    mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'Icon', ext: '.ts' }]);
    mockResolveAllImports.mockReturnValue([
      { name: 'Icon', source: '@/icons/Icon', isDefault: true },
      { name: 'Icon', source: '@/shared/Icon', isDefault: false },
    ]);
    mockClackSelect.mockResolvedValue('@/icons/Icon');

    const cli = new AutoImportCli([plugin]);
    await cli.run('/project', { extensions: '.ts', interactive: true, dryRun: true });

    expect(mockFsWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('.import-pilot.json'),
      expect.stringContaining('"resolvedImports"'),
      'utf-8',
    );

    const writeCall = mockFsWriteFile.mock.calls.find(
      (c: string[]) => typeof c[0] === 'string' && c[0].endsWith('.import-pilot.json'),
    );
    expect(writeCall).toBeDefined();
    const written = JSON.parse(writeCall![1]);
    expect(written.resolvedImports.Icon).toBe('@/icons/Icon');
  });

  it('should use first match as fallback when select is cancelled', async () => {
    const plugin = createMockPlugin({
      findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Modal', location: 0 }]),
    });

    mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'Modal', ext: '.ts' }]);
    mockResolveAllImports.mockReturnValue([
      { name: 'Modal', source: '@/ui/Modal', isDefault: true },
      { name: 'Modal', source: '@/shared/Modal', isDefault: false },
    ]);
    mockClackSelect.mockResolvedValue(Symbol('cancel'));

    const cli = new AutoImportCli([plugin]);
    await cli.run('/project', { extensions: '.ts', interactive: true, dryRun: true });

    const output = logSpy.mock.calls.map((c: unknown[]) => (c as string[]).map(String).join(' ')).join('\n');
    expect(output).toContain('Resolvable imports: 1');
  });

  it('should not call resolveAllImports when interactive is false', async () => {
    const plugin = createMockPlugin({
      findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Button', location: 0 }]),
    });

    mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'Button', ext: '.ts' }]);
    mockResolveImport.mockReturnValue({
      name: 'Button',
      source: '@/components/Button',
      isDefault: true,
    });

    const cli = new AutoImportCli([plugin]);
    await cli.run('/project', { extensions: '.ts', interactive: false, dryRun: true });

    expect(mockResolveAllImports).not.toHaveBeenCalled();
    expect(mockResolveImport).toHaveBeenCalled();
  });

  it('should return null when resolveAllImports returns empty', async () => {
    const plugin = createMockPlugin({
      findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Missing', location: 0 }]),
    });

    mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'Missing', ext: '.ts' }]);
    mockResolveAllImports.mockReturnValue([]);

    const cli = new AutoImportCli([plugin]);
    await cli.run('/project', { extensions: '.ts', interactive: true, dryRun: true });

    const output = logSpy.mock.calls.map((c: unknown[]) => (c as string[]).map(String).join(' ')).join('\n');
    expect(output).toContain('Resolvable imports: 0');
  });
});

describe('ImportResolver.resolveAllImports', () => {
  it('should return all matching exports for an identifier', () => {
    const { ImportResolver } = jest.requireActual('@/resolver/importResolver') as {
      ImportResolver: new (...args: unknown[]) => {
        resolveAllImports: (id: string, file: string) => unknown[];
        getExportCache: () => Map<string, unknown[]>;
      };
    };

    const resolver = new ImportResolver({ projectRoot: '/test' });
    const cache = resolver.getExportCache();
    cache.set('/test/a.ts', [{ name: 'Button', source: '/test/a.ts', isDefault: true }]);
    cache.set('/test/b.ts', [{ name: 'Button', source: '/test/b.ts', isDefault: false }]);

    const results = resolver.resolveAllImports('Button', '/test/c.ts');

    expect(results).toHaveLength(2);
    expect((results[0] as { source: string }).source).toContain('a');
    expect((results[1] as { source: string }).source).toContain('b');
  });

  it('should exclude the current file from results', () => {
    const { ImportResolver } = jest.requireActual('@/resolver/importResolver') as {
      ImportResolver: new (...args: unknown[]) => {
        resolveAllImports: (id: string, file: string) => unknown[];
        getExportCache: () => Map<string, unknown[]>;
      };
    };

    const resolver = new ImportResolver({ projectRoot: '/test' });
    const cache = resolver.getExportCache();
    cache.set('/test/a.ts', [{ name: 'Foo', source: '/test/a.ts', isDefault: false }]);
    cache.set('/test/b.ts', [{ name: 'Foo', source: '/test/b.ts', isDefault: false }]);

    const results = resolver.resolveAllImports('Foo', '/test/a.ts');

    expect(results).toHaveLength(1);
  });

  it('should return empty array when no matches', () => {
    const { ImportResolver } = jest.requireActual('@/resolver/importResolver') as {
      ImportResolver: new (...args: unknown[]) => {
        resolveAllImports: (id: string, file: string) => unknown[];
      };
    };

    const resolver = new ImportResolver({ projectRoot: '/test' });
    const results = resolver.resolveAllImports('NonExistent', '/test/c.ts');

    expect(results).toHaveLength(0);
  });
});

describe('createCli --interactive flag', () => {
  it('should register --interactive and --no-interactive flags', () => {
    const { createCli } = jest.requireActual('@/cli/autoImportCli') as {
      createCli: () => { options: Array<{ long: string; short?: string }> };
    };
    const program = createCli();
    const optionFlags = program.options.map((o: { long: string }) => o.long);

    expect(optionFlags).toContain('--interactive');
    expect(optionFlags).toContain('--no-interactive');
  });
});
