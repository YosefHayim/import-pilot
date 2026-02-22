import { FileScanner } from '@/scanner/fileScanner';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-pilot-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createFile(relativePath: string, content = ''): string {
  const fullPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  return fullPath;
}

describe('FileScanner', () => {
  describe('scan()', () => {
    it('should return files matching a single extension', async () => {
      createFile('app.ts', 'const x = 1;');
      createFile('style.css', 'body {}');

      const scanner = new FileScanner();
      const results = await scanner.scan({ cwd: tmpDir, extensions: ['.ts'] });

      expect(results).toHaveLength(1);
      expect(results[0].ext).toBe('.ts');
      expect(results[0].content).toBe('const x = 1;');
    });

    it('should return files matching multiple extensions', async () => {
      createFile('app.ts', 'export const a = 1;');
      createFile('Component.tsx', '<div />');
      createFile('style.css', 'body {}');

      const scanner = new FileScanner();
      const results = await scanner.scan({ cwd: tmpDir, extensions: ['.ts', '.tsx'] });

      expect(results).toHaveLength(2);
      const exts = results.map((f) => f.ext).sort();
      expect(exts).toEqual(['.ts', '.tsx']);
    });

    it('should use default extensions when none specified', async () => {
      createFile('index.ts', '');
      createFile('app.py', '');
      createFile('readme.md', '');

      const scanner = new FileScanner();
      const results = await scanner.scan({ cwd: tmpDir });

      const exts = results.map((f) => f.ext).sort();
      expect(exts).toContain('.ts');
      expect(exts).toContain('.py');
      expect(exts).not.toContain('.md');
    });

    it('should ignore node_modules by default', async () => {
      createFile('src/app.ts', 'export const a = 1;');
      createFile('node_modules/pkg/index.ts', 'export const b = 2;');

      const scanner = new FileScanner();
      const results = await scanner.scan({ cwd: tmpDir, extensions: ['.ts'] });

      expect(results).toHaveLength(1);
      expect(results[0].path).toContain('src');
    });

    it('should ignore dist directory by default', async () => {
      createFile('src/app.ts', 'source');
      createFile('dist/app.ts', 'compiled');

      const scanner = new FileScanner();
      const results = await scanner.scan({ cwd: tmpDir, extensions: ['.ts'] });

      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('source');
    });

    it('should apply custom ignore patterns', async () => {
      createFile('src/app.ts', 'keep');
      createFile('generated/types.ts', 'ignore me');

      const scanner = new FileScanner();
      const results = await scanner.scan({
        cwd: tmpDir,
        extensions: ['.ts'],
        ignore: ['**/generated/**'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('keep');
    });

    it('should merge custom ignore with default ignore', async () => {
      createFile('src/app.ts', 'keep');
      createFile('node_modules/pkg/index.ts', 'default-ignored');
      createFile('custom-out/bundle.ts', 'custom-ignored');

      const scanner = new FileScanner();
      const results = await scanner.scan({
        cwd: tmpDir,
        extensions: ['.ts'],
        ignore: ['**/custom-out/**'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('keep');
    });

    it('should return empty array for empty directory', async () => {
      const scanner = new FileScanner();
      const results = await scanner.scan({ cwd: tmpDir, extensions: ['.ts'] });

      expect(results).toEqual([]);
    });

    it('should return empty array when no files match the extension', async () => {
      createFile('readme.md', '# Hello');
      createFile('data.json', '{}');

      const scanner = new FileScanner();
      const results = await scanner.scan({ cwd: tmpDir, extensions: ['.ts'] });

      expect(results).toEqual([]);
    });

    it('should find files in nested subdirectories', async () => {
      createFile('a/b/c/deep.ts', 'deep file');
      createFile('x/y.ts', 'shallow file');

      const scanner = new FileScanner();
      const results = await scanner.scan({ cwd: tmpDir, extensions: ['.ts'] });

      expect(results).toHaveLength(2);
      const contents = results.map((f) => f.content).sort();
      expect(contents).toEqual(['deep file', 'shallow file']);
    });

    it('should return absolute paths', async () => {
      createFile('app.ts', '');

      const scanner = new FileScanner();
      const results = await scanner.scan({ cwd: tmpDir, extensions: ['.ts'] });

      expect(results).toHaveLength(1);
      expect(path.isAbsolute(results[0].path)).toBe(true);
    });

    it('should include correct ext property for each file', async () => {
      createFile('app.ts', '');
      createFile('component.tsx', '');
      createFile('script.py', '');

      const scanner = new FileScanner();
      const results = await scanner.scan({ cwd: tmpDir, extensions: ['.ts', '.tsx', '.py'] });

      const extMap = new Map(results.map((f) => [path.basename(f.path), f.ext]));
      expect(extMap.get('app.ts')).toBe('.ts');
      expect(extMap.get('component.tsx')).toBe('.tsx');
      expect(extMap.get('script.py')).toBe('.py');
    });

    it('should read file content correctly', async () => {
      const multiline = 'line1\nline2\nline3';
      createFile('multi.ts', multiline);

      const scanner = new FileScanner();
      const results = await scanner.scan({ cwd: tmpDir, extensions: ['.ts'] });

      expect(results).toHaveLength(1);
      expect(results[0].content).toBe(multiline);
    });

    it('should warn and skip unreadable files', async () => {
      createFile('good.ts', 'good content');
      const brokenLink = path.join(tmpDir, 'broken.ts');
      fs.symlinkSync(path.join(tmpDir, 'nonexistent_target.ts'), brokenLink);

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const scanner = new FileScanner();
        const results = await scanner.scan({ cwd: tmpDir, extensions: ['.ts'] });

        expect(results.some((f) => f.content === 'good content')).toBe(true);
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should ignore __pycache__ directories by default', async () => {
      createFile('src/app.py', 'print("hi")');
      createFile('__pycache__/app.cpython-311.py', 'compiled');

      const scanner = new FileScanner();
      const results = await scanner.scan({ cwd: tmpDir, extensions: ['.py'] });

      expect(results).toHaveLength(1);
      expect(results[0].path).toContain('src');
    });

    it('should ignore .venv and venv directories by default', async () => {
      createFile('src/app.py', 'source');
      createFile('.venv/lib/site.py', 'venv file');
      createFile('venv/lib/site.py', 'venv file');

      const scanner = new FileScanner();
      const results = await scanner.scan({ cwd: tmpDir, extensions: ['.py'] });

      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('source');
    });
  });

  describe('scanFile()', () => {
    it('should return ScannedFile for a valid file', async () => {
      const filePath = createFile('module.ts', 'export const x = 1;');

      const scanner = new FileScanner();
      const result = await scanner.scanFile(filePath);

      expect(result).not.toBeNull();
      expect(result!.content).toBe('export const x = 1;');
      expect(result!.ext).toBe('.ts');
      expect(path.isAbsolute(result!.path)).toBe(true);
    });

    it('should resolve relative paths to absolute', async () => {
      createFile('rel.ts', 'content');
      const relativePath = path.join(tmpDir, 'rel.ts');

      const scanner = new FileScanner();
      const result = await scanner.scanFile(relativePath);

      expect(result).not.toBeNull();
      expect(path.isAbsolute(result!.path)).toBe(true);
    });

    it('should return null for non-existent file', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const scanner = new FileScanner();
        const result = await scanner.scanFile(path.join(tmpDir, 'does-not-exist.ts'));

        expect(result).toBeNull();
        expect(errorSpy).toHaveBeenCalled();
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('should return correct ext for various file types', async () => {
      const pyFile = createFile('script.py', 'print("hi")');
      const tsxFile = createFile('comp.tsx', '<div />');

      const scanner = new FileScanner();
      const pyResult = await scanner.scanFile(pyFile);
      const tsxResult = await scanner.scanFile(tsxFile);

      expect(pyResult!.ext).toBe('.py');
      expect(tsxResult!.ext).toBe('.tsx');
    });

    it('should read file content faithfully including special characters', async () => {
      const content = 'const emoji = "🚀";\nconst path = "C:\\\\Users";';
      const filePath = createFile('special.ts', content);

      const scanner = new FileScanner();
      const result = await scanner.scanFile(filePath);

      expect(result).not.toBeNull();
      expect(result!.content).toBe(content);
    });
  });
});
