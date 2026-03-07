import * as path from 'path';
import type { ScannedFile } from '@/scanner/fileScanner.js';
import type { LanguagePlugin } from '@/plugins/languagePlugin.js';
import { getPluginForExtension } from '@/plugins/index.js';

export interface UnusedFileOptions {
  entryPoints?: string[];
}

const EXCLUDED_PATTERNS = [
  /\.test\.\w+$/,
  /\.spec\.\w+$/,
  /\/__tests__\//,
  /\.config\.\w+$/,
  /\.d\.ts$/,
  /\bconftest\.py$/,
  /\bsetup\.py$/,
  /\b__init__\.py$/,
];

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.astro', '.py', '.ex', '.exs', '.go', '.rs'];

export class UnusedFileAnalyzer {
  private projectRoot: string;
  private options: UnusedFileOptions;

  constructor(projectRoot: string, options: UnusedFileOptions = {}) {
    this.projectRoot = projectRoot;
    this.options = options;
  }

  findUnusedFiles(files: ScannedFile[], plugins: LanguagePlugin[]): string[] {
    const filePaths = new Set(files.map((f) => f.path));
    const importedFiles = new Set<string>();

    for (const file of files) {
      const plugin = getPluginForExtension(file.ext, plugins);
      if (!plugin) continue;

      const imports = plugin.parseImports(file.content, file.path);
      for (const imp of imports) {
        const resolved = this.resolveImportSource(imp.source, file.path, filePaths);
        if (resolved) {
          importedFiles.add(resolved);
        }
      }
    }

    const entryPointsAbsolute = new Set(
      (this.options.entryPoints ?? []).map((ep) => path.resolve(this.projectRoot, ep)),
    );

    return files
      .map((f) => f.path)
      .filter((filePath) => !this.isExcludedFile(filePath))
      .filter((filePath) => !entryPointsAbsolute.has(filePath))
      .filter((filePath) => !importedFiles.has(filePath));
  }

  private isExcludedFile(filePath: string): boolean {
    const basename = path.basename(filePath);

    if (/^index\.\w+$/.test(basename)) return true;

    for (const pattern of EXCLUDED_PATTERNS) {
      if (pattern.test(filePath)) return true;
    }

    return false;
  }

  private resolveImportSource(source: string, fromFile: string, knownFiles: Set<string>): string | null {
    if (!source.startsWith('.') && !source.startsWith('/')) return null;

    const fromDir = path.dirname(fromFile);
    const basePath = path.resolve(fromDir, source);

    if (knownFiles.has(basePath)) return basePath;

    for (const ext of EXTENSIONS) {
      const withExt = basePath + ext;
      if (knownFiles.has(withExt)) return withExt;
    }

    for (const ext of EXTENSIONS) {
      const indexPath = path.join(basePath, 'index' + ext);
      if (knownFiles.has(indexPath)) return indexPath;
    }

    return null;
  }
}
