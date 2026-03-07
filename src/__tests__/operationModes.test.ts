import type { LanguagePlugin } from '@/plugins/languagePlugin';

const mockScan = jest.fn();
const mockBuildExportCache = jest.fn();
const mockResolveImport = jest.fn();
const mockDetectProjectLanguages = jest.fn();
const mockWriteReport = jest.fn();
const mockSortImports = jest.fn();
const mockFsReadFile = jest.fn();
const mockFsWriteFile = jest.fn();

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

import { AutoImportCli } from '@/cli/autoImportCli';

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

describe('Operation Modes', () => {
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

  describe('resolveMode', () => {
    it('should return "add" by default (no flags)', () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      expect(cli.resolveMode({})).toBe('add');
    });

    it('should return "add" when --add-only is set', () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      expect(cli.resolveMode({ addOnly: true })).toBe('add');
    });

    it('should return "sort-only" when --sort-only is set', () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      expect(cli.resolveMode({ sortOnly: true })).toBe('sort-only');
    });

    it('should return "remove-unused" when --remove-unused is set', () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      expect(cli.resolveMode({ removeUnused: true })).toBe('remove-unused');
    });

    it('should return "organize" when --organize is set', () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      expect(cli.resolveMode({ organize: true })).toBe('organize');
    });
  });

  describe('--sort-only mode', () => {
    it('should not build export cache', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      await cli.run('/project', { extensions: '.ts', sortOnly: true });

      expect(mockBuildExportCache).not.toHaveBeenCalled();
    });

    it('should log mode as sort-only', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      await cli.run('/project', { extensions: '.ts', sortOnly: true });

      expect(allLogOutput(logSpy)).toContain('Mode: sort-only');
    });

    it('should sort existing imports and write file', async () => {
      const plugin = createMockPlugin({
        parseImports: jest.fn().mockReturnValue([
          { source: './zeta', imports: ['Zeta'], isDefault: false },
          { source: './alpha', imports: ['Alpha'], isDefault: false },
        ]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([
        {
          path: '/project/src/app.ts',
          content: "import { Zeta } from './zeta';\nimport { Alpha } from './alpha';\nconst x = 1;",
          ext: '.ts',
        },
      ]);
      mockSortImports.mockReturnValue(["import { Alpha } from './alpha';", "import { Zeta } from './zeta';"]);

      await cli.run('/project', { extensions: '.ts', sortOnly: true });

      expect(mockSortImports).toHaveBeenCalled();
      expect(plugin.insertImports).toHaveBeenCalled();
      expect(mockFsWriteFile).toHaveBeenCalled();
    });

    it('should not write file when sorting changes nothing', async () => {
      const plugin = createMockPlugin({
        parseImports: jest.fn().mockReturnValue([{ source: './alpha', imports: ['Alpha'], isDefault: false }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([
        { path: '/project/src/app.ts', content: "import { Alpha } from './alpha';\nconst x = 1;", ext: '.ts' },
      ]);
      mockSortImports.mockReturnValue(["import { Alpha } from './alpha';"]);

      await cli.run('/project', { extensions: '.ts', sortOnly: true });

      expect(mockFsWriteFile).not.toHaveBeenCalled();
    });

    it('should not write file in dry-run mode', async () => {
      const plugin = createMockPlugin({
        parseImports: jest.fn().mockReturnValue([
          { source: './zeta', imports: ['Zeta'], isDefault: false },
          { source: './alpha', imports: ['Alpha'], isDefault: false },
        ]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([
        {
          path: '/project/src/app.ts',
          content: "import { Zeta } from './zeta';\nimport { Alpha } from './alpha';",
          ext: '.ts',
        },
      ]);
      mockSortImports.mockReturnValue(["import { Alpha } from './alpha';", "import { Zeta } from './zeta';"]);

      await cli.run('/project', { extensions: '.ts', sortOnly: true, dryRun: true });

      expect(mockFsWriteFile).not.toHaveBeenCalled();
      expect(allLogOutput(logSpy)).toContain('Dry run mode');
    });

    it('should not attempt to resolve missing imports', async () => {
      const plugin = createMockPlugin({
        parseImports: jest.fn().mockReturnValue([]),
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Foo', line: 1, column: 0 }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'Foo();', ext: '.ts' }]);

      await cli.run('/project', { extensions: '.ts', sortOnly: true });

      expect(mockResolveImport).not.toHaveBeenCalled();
    });
  });

  describe('--remove-unused mode', () => {
    it('should build export cache', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      await cli.run('/project', { extensions: '.ts', removeUnused: true });

      expect(mockBuildExportCache).toHaveBeenCalled();
    });

    it('should log mode as remove-unused', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      await cli.run('/project', { extensions: '.ts', removeUnused: true });

      expect(allLogOutput(logSpy)).toContain('Mode: remove-unused');
    });

    it('should remove imports not used in the file', async () => {
      const plugin = createMockPlugin({
        parseImports: jest.fn().mockReturnValue([
          { source: './foo', imports: ['Foo'], isDefault: false },
          { source: './bar', imports: ['Bar'], isDefault: false },
        ]),
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Foo', line: 5, column: 0 }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([
        {
          path: '/project/src/app.ts',
          content: "import { Foo } from './foo';\nimport { Bar } from './bar';\nFoo();",
          ext: '.ts',
        },
      ]);

      await cli.run('/project', { extensions: '.ts', removeUnused: true });

      expect(mockFsWriteFile).toHaveBeenCalled();
      const writtenContent = mockFsWriteFile.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('Bar');
    });

    it('should not remove imports that are used', async () => {
      const plugin = createMockPlugin({
        parseImports: jest.fn().mockReturnValue([{ source: './foo', imports: ['Foo'], isDefault: false }]),
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Foo', line: 5, column: 0 }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([
        {
          path: '/project/src/app.ts',
          content: "import { Foo } from './foo';\nFoo();",
          ext: '.ts',
        },
      ]);

      await cli.run('/project', { extensions: '.ts', removeUnused: true });

      expect(mockFsWriteFile).not.toHaveBeenCalled();
    });

    it('should not write file in dry-run mode', async () => {
      const plugin = createMockPlugin({
        parseImports: jest.fn().mockReturnValue([{ source: './bar', imports: ['Bar'], isDefault: false }]),
        findUsedIdentifiers: jest.fn().mockReturnValue([]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([
        { path: '/project/src/app.ts', content: "import { Bar } from './bar';", ext: '.ts' },
      ]);

      await cli.run('/project', { extensions: '.ts', removeUnused: true, dryRun: true });

      expect(mockFsWriteFile).not.toHaveBeenCalled();
      expect(allLogOutput(logSpy)).toContain('Dry run mode');
    });

    it('should log summary with correct counts', async () => {
      const plugin = createMockPlugin({
        parseImports: jest.fn().mockReturnValue([{ source: './bar', imports: ['Bar'], isDefault: false }]),
        findUsedIdentifiers: jest.fn().mockReturnValue([]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([
        { path: '/project/src/app.ts', content: "import { Bar } from './bar';", ext: '.ts' },
      ]);

      await cli.run('/project', { extensions: '.ts', removeUnused: true, dryRun: true });

      const output = allLogOutput(logSpy);
      expect(output).toContain('Files with unused imports: 1');
      expect(output).toContain('Total imports removed: 1');
    });

    it('should keep imports whose names are re-exported', async () => {
      const plugin = createMockPlugin({
        parseImports: jest.fn().mockReturnValue([{ source: './bar', imports: ['Bar'], isDefault: false }]),
        findUsedIdentifiers: jest.fn().mockReturnValue([]),
        parseExports: jest.fn().mockReturnValue([{ name: 'Bar', source: '/project/src/app.ts', isDefault: false }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([
        { path: '/project/src/app.ts', content: "import { Bar } from './bar';\nexport { Bar };", ext: '.ts' },
      ]);

      await cli.run('/project', { extensions: '.ts', removeUnused: true });

      expect(mockFsWriteFile).not.toHaveBeenCalled();
    });
  });

  describe('--organize mode', () => {
    it('should build export cache', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      await cli.run('/project', { extensions: '.ts', organize: true });

      expect(mockBuildExportCache).toHaveBeenCalled();
    });

    it('should log mode as organize', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      await cli.run('/project', { extensions: '.ts', organize: true });

      expect(allLogOutput(logSpy)).toContain('Mode: organize');
    });

    it('should remove unused, add missing, and sort', async () => {
      const plugin = createMockPlugin({
        parseImports: jest.fn().mockReturnValue([
          { source: './foo', imports: ['Foo'], isDefault: false },
          { source: './unused', imports: ['Unused'], isDefault: false },
        ]),
        findUsedIdentifiers: jest.fn().mockReturnValue([
          { name: 'Foo', line: 5, column: 0 },
          { name: 'NewThing', line: 6, column: 0 },
        ]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([
        {
          path: '/project/src/app.ts',
          content: "import { Foo } from './foo';\nimport { Unused } from './unused';\nFoo(); NewThing();",
          ext: '.ts',
        },
      ]);
      mockResolveImport.mockReturnValue({ name: 'NewThing', source: './newThing', isDefault: false });

      await cli.run('/project', { extensions: '.ts', organize: true });

      expect(mockSortImports).toHaveBeenCalled();
      expect(mockFsWriteFile).toHaveBeenCalled();

      const output = allLogOutput(logSpy);
      expect(output).toContain('Imports removed: 1');
      expect(output).toContain('Imports added: 1');
    });

    it('should not write file in dry-run mode', async () => {
      const plugin = createMockPlugin({
        parseImports: jest.fn().mockReturnValue([{ source: './unused', imports: ['Unused'], isDefault: false }]),
        findUsedIdentifiers: jest.fn().mockReturnValue([]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([
        { path: '/project/src/app.ts', content: "import { Unused } from './unused';", ext: '.ts' },
      ]);

      await cli.run('/project', { extensions: '.ts', organize: true, dryRun: true });

      expect(mockFsWriteFile).not.toHaveBeenCalled();
      expect(allLogOutput(logSpy)).toContain('Dry run mode');
    });
  });

  describe('--add-only mode (explicit)', () => {
    it('should behave the same as default mode', async () => {
      const plugin = createMockPlugin({
        findUsedIdentifiers: jest.fn().mockReturnValue([{ name: 'Foo', line: 1, column: 0 }]),
      });
      const cli = new AutoImportCli([plugin]);

      mockScan.mockResolvedValue([{ path: '/project/src/app.ts', content: 'Foo();', ext: '.ts' }]);
      mockResolveImport.mockReturnValue({ name: 'Foo', source: './foo', isDefault: false });
      mockFsReadFile.mockResolvedValue('Foo();');

      await cli.run('/project', { extensions: '.ts', addOnly: true });

      expect(mockResolveImport).toHaveBeenCalledWith('Foo', '/project/src/app.ts');
      expect(mockFsWriteFile).toHaveBeenCalled();
    });

    it('should log mode as add', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      await cli.run('/project', { extensions: '.ts', addOnly: true });

      expect(allLogOutput(logSpy)).toContain('Mode: add');
    });
  });

  describe('default mode (no flags)', () => {
    it('should use add mode and build export cache', async () => {
      const cli = new AutoImportCli([createMockPlugin()]);
      await cli.run('/project', { extensions: '.ts' });

      expect(mockBuildExportCache).toHaveBeenCalled();
      expect(allLogOutput(logSpy)).toContain('Mode: add');
    });
  });
});
