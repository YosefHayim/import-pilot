import * as path from 'path';
import * as fs from 'fs/promises';
import { FileScanner } from '@/scanner/fileScanner.js';
import { ImportResolver } from '@/resolver/importResolver.js';
import type { LanguagePlugin } from '@/plugins/languagePlugin.js';
import { getPluginForExtension, getDefaultPlugins, getAllExtensions } from '@/plugins/index.js';

export interface UnusedExport {
  name: string;
  filePath: string;
  isDefault: boolean;
}

export interface UnusedExportOptions {
  extensions?: string;
  ignore?: string;
  alias?: boolean;
  verbose?: boolean;
}

const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|js|jsx)$/;
const INDEX_FILE_PATTERN = /[/\\]index\.(ts|tsx|js|jsx)$/;

export class UnusedExportAnalyzer {
  private scanner: FileScanner;
  private plugins: LanguagePlugin[];

  constructor(plugins?: LanguagePlugin[]) {
    this.scanner = new FileScanner();
    this.plugins = plugins ?? getDefaultPlugins();
  }

  async analyze(directory: string, options: UnusedExportOptions = {}): Promise<UnusedExport[]> {
    const projectRoot = path.resolve(directory);

    let extensions: string[];
    if (options.extensions) {
      extensions = options.extensions
        .split(',')
        .map((ext) => (ext.trim().startsWith('.') ? ext.trim() : '.' + ext.trim()));
    } else {
      extensions = getAllExtensions(this.plugins);
    }

    const resolver = new ImportResolver({
      projectRoot,
      extensions,
      useAliases: options.alias !== false,
      plugins: this.plugins,
      verbose: options.verbose,
    });
    await resolver.buildExportCache();

    const ignore = options.ignore ? options.ignore.split(',').map((pattern) => pattern.trim()) : undefined;
    const files = await this.scanner.scan({ cwd: projectRoot, extensions, ignore });

    const exportCache = resolver.getExportCache();
    const entryPoints = await this.resolveEntryPoints(projectRoot);
    const knownFiles = new Set([...exportCache.keys(), ...files.map((f) => f.path)]);
    const importedIdentifiers = new Map<string, Set<string>>();

    for (const file of files) {
      const plugin = getPluginForExtension(file.ext, this.plugins);
      if (!plugin) continue;

      const imports = plugin.parseImports(file.content, file.path);
      for (const imp of imports) {
        const resolvedSource = this.resolveImportSource(imp.source, file.path, extensions, knownFiles);
        if (!resolvedSource) continue;

        if (!importedIdentifiers.has(resolvedSource)) {
          importedIdentifiers.set(resolvedSource, new Set());
        }

        if (imp.isNamespace) {
          importedIdentifiers.get(resolvedSource)!.add('*');
        } else {
          for (const name of imp.imports) {
            importedIdentifiers.get(resolvedSource)!.add(name);
          }
        }
      }
    }

    const unusedExports: UnusedExport[] = [];

    for (const [filePath, exports] of exportCache.entries()) {
      if (this.isExcludedFile(filePath, entryPoints)) continue;

      const fileImported = importedIdentifiers.get(filePath);

      if (fileImported?.has('*')) continue;

      for (const exp of exports) {
        if (exp.name === '*') continue;

        const isUsed = fileImported?.has(exp.name) ?? false;
        if (!isUsed) {
          unusedExports.push({
            name: exp.name,
            filePath,
            isDefault: exp.isDefault,
          });
        }
      }
    }

    return unusedExports;
  }

  private isExcludedFile(filePath: string, entryPoints: Set<string>): boolean {
    if (INDEX_FILE_PATTERN.test(filePath)) return true;
    if (TEST_FILE_PATTERN.test(filePath)) return true;
    if (entryPoints.has(filePath)) return true;
    return false;
  }

  private async resolveEntryPoints(projectRoot: string): Promise<Set<string>> {
    const entryPoints = new Set<string>();
    try {
      const pkgPath = path.join(projectRoot, 'package.json');
      const raw = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(raw);

      if (pkg.main) {
        entryPoints.add(path.resolve(projectRoot, pkg.main));
      }

      if (pkg.bin) {
        const bins = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin);
        for (const bin of bins) {
          entryPoints.add(path.resolve(projectRoot, bin as string));
        }
      }

      if (pkg.exports) {
        this.collectExportPaths(pkg.exports, projectRoot, entryPoints);
      }
    } catch {
      /* no package.json */
    }
    return entryPoints;
  }

  private collectExportPaths(exports: unknown, projectRoot: string, entryPoints: Set<string>): void {
    if (typeof exports === 'string') {
      entryPoints.add(path.resolve(projectRoot, exports));
      return;
    }
    if (typeof exports === 'object' && exports !== null) {
      for (const value of Object.values(exports)) {
        this.collectExportPaths(value, projectRoot, entryPoints);
      }
    }
  }

  private resolveImportSource(
    source: string,
    fromFile: string,
    extensions: string[],
    knownFiles: Set<string>,
  ): string | null {
    if (!source.startsWith('.') && !source.startsWith('/')) return null;

    const dir = path.dirname(fromFile);
    const basePath = path.resolve(dir, source);

    if (knownFiles.has(basePath)) return basePath;

    for (const ext of extensions) {
      const withExt = basePath + ext;
      if (knownFiles.has(withExt)) return withExt;
    }

    for (const ext of extensions) {
      const indexPath = path.join(basePath, 'index' + ext);
      if (knownFiles.has(indexPath)) return indexPath;
    }

    return null;
  }
}
