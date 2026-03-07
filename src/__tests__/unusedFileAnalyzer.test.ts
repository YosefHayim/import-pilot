import { UnusedFileAnalyzer } from '@/analyzer/unusedFileAnalyzer.js';
import type { ScannedFile } from '@/scanner/fileScanner.js';
import type { LanguagePlugin } from '@/plugins/languagePlugin.js';

// Minimal stub plugin for testing
function createStubPlugin(overrides: Partial<LanguagePlugin> = {}): LanguagePlugin {
  return {
    name: 'test-plugin',
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    parseImports: () => [],
    findUsedIdentifiers: () => [],
    parseExports: () => [],
    isBuiltInOrKeyword: () => false,
    generateImportStatement: () => '',
    getImportInsertPosition: () => 0,
    insertImports: (c) => c,
    ...overrides,
  };
}

describe('UnusedFileAnalyzer', () => {
  describe('findUnusedFiles', () => {
    it('should detect files with zero incoming imports as orphans', () => {
      const plugin = createStubPlugin({
        parseImports: (content: string) => {
          // fileA imports from fileB
          if (content.includes('import { Foo }')) {
            return [{ source: './fileB', imports: ['Foo'] }];
          }
          return [];
        },
      });

      const files: ScannedFile[] = [
        { path: '/project/src/fileA.ts', content: "import { Foo } from './fileB';", ext: '.ts' },
        { path: '/project/src/fileB.ts', content: 'export const Foo = 1;', ext: '.ts' },
        { path: '/project/src/fileC.ts', content: 'export const Bar = 2;', ext: '.ts' },
      ];

      const analyzer = new UnusedFileAnalyzer('/project');
      const orphans = analyzer.findUnusedFiles(files, [plugin]);

      // fileA is imported by nobody, fileC is imported by nobody
      // fileB is imported by fileA — not orphan
      expect(orphans).toContain('/project/src/fileA.ts');
      expect(orphans).toContain('/project/src/fileC.ts');
      expect(orphans).not.toContain('/project/src/fileB.ts');
    });

    it('should exclude test files', () => {
      const plugin = createStubPlugin();

      const files: ScannedFile[] = [
        { path: '/project/src/utils.test.ts', content: '', ext: '.ts' },
        { path: '/project/src/utils.spec.ts', content: '', ext: '.ts' },
        { path: '/project/src/__tests__/foo.test.ts', content: '', ext: '.ts' },
        { path: '/project/src/orphan.ts', content: 'export const x = 1;', ext: '.ts' },
      ];

      const analyzer = new UnusedFileAnalyzer('/project');
      const orphans = analyzer.findUnusedFiles(files, [plugin]);

      expect(orphans).not.toContain('/project/src/utils.test.ts');
      expect(orphans).not.toContain('/project/src/utils.spec.ts');
      expect(orphans).not.toContain('/project/src/__tests__/foo.test.ts');
      expect(orphans).toContain('/project/src/orphan.ts');
    });

    it('should exclude config files', () => {
      const plugin = createStubPlugin();

      const files: ScannedFile[] = [
        { path: '/project/jest.config.ts', content: '', ext: '.ts' },
        { path: '/project/vite.config.ts', content: '', ext: '.ts' },
        { path: '/project/eslint.config.js', content: '', ext: '.js' },
        { path: '/project/tailwind.config.js', content: '', ext: '.js' },
      ];

      const analyzer = new UnusedFileAnalyzer('/project');
      const orphans = analyzer.findUnusedFiles(files, [plugin]);

      expect(orphans).toHaveLength(0);
    });

    it('should exclude .d.ts declaration files', () => {
      const plugin = createStubPlugin();

      const files: ScannedFile[] = [
        { path: '/project/src/types.d.ts', content: '', ext: '.ts' },
        { path: '/project/src/env.d.ts', content: '', ext: '.ts' },
      ];

      const analyzer = new UnusedFileAnalyzer('/project');
      const orphans = analyzer.findUnusedFiles(files, [plugin]);

      expect(orphans).toHaveLength(0);
    });

    it('should exclude index barrel files', () => {
      const plugin = createStubPlugin();

      const files: ScannedFile[] = [
        { path: '/project/src/index.ts', content: '', ext: '.ts' },
        { path: '/project/src/components/index.js', content: '', ext: '.js' },
      ];

      const analyzer = new UnusedFileAnalyzer('/project');
      const orphans = analyzer.findUnusedFiles(files, [plugin]);

      expect(orphans).toHaveLength(0);
    });

    it('should exclude entry points from package.json', () => {
      const plugin = createStubPlugin();

      const files: ScannedFile[] = [
        { path: '/project/src/main.ts', content: '', ext: '.ts' },
        { path: '/project/src/orphan.ts', content: '', ext: '.ts' },
      ];

      const analyzer = new UnusedFileAnalyzer('/project', {
        entryPoints: ['src/main.ts'],
      });
      const orphans = analyzer.findUnusedFiles(files, [plugin]);

      expect(orphans).not.toContain('/project/src/main.ts');
      expect(orphans).toContain('/project/src/orphan.ts');
    });

    it('should resolve relative import sources to absolute paths', () => {
      const plugin = createStubPlugin({
        parseImports: (_content: string, filePath: string) => {
          if (filePath === '/project/src/app.ts') {
            return [{ source: './utils/helper', imports: ['doStuff'] }];
          }
          return [];
        },
      });

      const files: ScannedFile[] = [
        { path: '/project/src/app.ts', content: '', ext: '.ts' },
        { path: '/project/src/utils/helper.ts', content: 'export function doStuff() {}', ext: '.ts' },
      ];

      const analyzer = new UnusedFileAnalyzer('/project');
      const orphans = analyzer.findUnusedFiles(files, [plugin]);

      // helper.ts is imported by app.ts — not orphan
      expect(orphans).not.toContain('/project/src/utils/helper.ts');
      // app.ts is not imported by anyone — orphan
      expect(orphans).toContain('/project/src/app.ts');
    });

    it('should handle imports without file extension', () => {
      const plugin = createStubPlugin({
        parseImports: (_content: string, filePath: string) => {
          if (filePath === '/project/src/app.ts') {
            return [{ source: './services/auth', imports: ['login'] }];
          }
          return [];
        },
      });

      const files: ScannedFile[] = [
        { path: '/project/src/app.ts', content: '', ext: '.ts' },
        { path: '/project/src/services/auth.ts', content: 'export function login() {}', ext: '.ts' },
      ];

      const analyzer = new UnusedFileAnalyzer('/project');
      const orphans = analyzer.findUnusedFiles(files, [plugin]);

      expect(orphans).not.toContain('/project/src/services/auth.ts');
    });

    it('should handle imports to index files from directory path', () => {
      const plugin = createStubPlugin({
        parseImports: (_content: string, filePath: string) => {
          if (filePath === '/project/src/app.ts') {
            return [{ source: './components', imports: ['Button'] }];
          }
          return [];
        },
      });

      const files: ScannedFile[] = [
        { path: '/project/src/app.ts', content: '', ext: '.ts' },
        { path: '/project/src/components/index.ts', content: "export { Button } from './Button';", ext: '.ts' },
      ];

      const analyzer = new UnusedFileAnalyzer('/project');
      const orphans = analyzer.findUnusedFiles(files, [plugin]);

      // index files are excluded by default, so this just checks they don't appear
      expect(orphans).not.toContain('/project/src/components/index.ts');
    });

    it('should return empty array when all files are imported', () => {
      const plugin = createStubPlugin({
        parseImports: (_content: string, filePath: string) => {
          if (filePath === '/project/src/a.ts') {
            return [{ source: './b', imports: ['B'] }];
          }
          if (filePath === '/project/src/b.ts') {
            return [{ source: './a', imports: ['A'] }];
          }
          return [];
        },
      });

      const files: ScannedFile[] = [
        { path: '/project/src/a.ts', content: '', ext: '.ts' },
        { path: '/project/src/b.ts', content: '', ext: '.ts' },
      ];

      const analyzer = new UnusedFileAnalyzer('/project');
      const orphans = analyzer.findUnusedFiles(files, [plugin]);

      expect(orphans).toHaveLength(0);
    });

    it('should skip external/package imports (non-relative)', () => {
      const plugin = createStubPlugin({
        parseImports: () => {
          return [
            { source: 'react', imports: ['useState'] },
            { source: '@mui/material', imports: ['Button'] },
          ];
        },
      });

      const files: ScannedFile[] = [
        { path: '/project/src/app.ts', content: '', ext: '.ts' },
        { path: '/project/src/orphan.ts', content: '', ext: '.ts' },
      ];

      const analyzer = new UnusedFileAnalyzer('/project');
      const orphans = analyzer.findUnusedFiles(files, [plugin]);

      // Both should be orphans since only external imports exist
      expect(orphans).toContain('/project/src/app.ts');
      expect(orphans).toContain('/project/src/orphan.ts');
    });

    it('should handle Python imports', () => {
      const pyPlugin = createStubPlugin({
        name: 'python',
        extensions: ['.py'],
        parseImports: (_content: string, filePath: string) => {
          if (filePath === '/project/main.py') {
            return [{ source: './utils', imports: ['helper'] }];
          }
          return [];
        },
      });

      const files: ScannedFile[] = [
        { path: '/project/main.py', content: '', ext: '.py' },
        { path: '/project/utils.py', content: 'def helper(): pass', ext: '.py' },
      ];

      const analyzer = new UnusedFileAnalyzer('/project');
      const orphans = analyzer.findUnusedFiles(files, [pyPlugin]);

      expect(orphans).not.toContain('/project/utils.py');
    });

    it('should exclude setup/config Python files', () => {
      const pyPlugin = createStubPlugin({
        name: 'python',
        extensions: ['.py'],
      });

      const files: ScannedFile[] = [
        { path: '/project/setup.py', content: '', ext: '.py' },
        { path: '/project/conftest.py', content: '', ext: '.py' },
        { path: '/project/__init__.py', content: '', ext: '.py' },
      ];

      const analyzer = new UnusedFileAnalyzer('/project');
      const orphans = analyzer.findUnusedFiles(files, [pyPlugin]);

      expect(orphans).toHaveLength(0);
    });
  });

  describe('isExcludedFile', () => {
    it('should correctly identify excluded file patterns', () => {
      const analyzer = new UnusedFileAnalyzer('/project');

      // Test files
      expect((analyzer as any).isExcludedFile('/project/foo.test.ts')).toBe(true);
      expect((analyzer as any).isExcludedFile('/project/foo.spec.js')).toBe(true);
      expect((analyzer as any).isExcludedFile('/project/__tests__/bar.ts')).toBe(true);

      // Config files
      expect((analyzer as any).isExcludedFile('/project/jest.config.ts')).toBe(true);
      expect((analyzer as any).isExcludedFile('/project/webpack.config.js')).toBe(true);

      // Declaration files
      expect((analyzer as any).isExcludedFile('/project/types.d.ts')).toBe(true);

      // Index files
      expect((analyzer as any).isExcludedFile('/project/src/index.ts')).toBe(true);

      // Python special files
      expect((analyzer as any).isExcludedFile('/project/__init__.py')).toBe(true);
      expect((analyzer as any).isExcludedFile('/project/conftest.py')).toBe(true);
      expect((analyzer as any).isExcludedFile('/project/setup.py')).toBe(true);

      // Normal files should NOT be excluded
      expect((analyzer as any).isExcludedFile('/project/src/utils.ts')).toBe(false);
      expect((analyzer as any).isExcludedFile('/project/src/app.tsx')).toBe(false);
    });
  });
});
