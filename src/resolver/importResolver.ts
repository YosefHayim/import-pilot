import * as fs from 'fs/promises';
import * as path from 'path';

import { glob } from 'glob';
import type { LanguagePlugin } from '@/plugins/languagePlugin.js';
import { getPluginForExtension } from '@/plugins/index.js';

export interface ExportInfo {
  name: string;
  source: string;
  isDefault: boolean;
  isType?: boolean;
  reExportSource?: string;
}

export interface ResolverOptions {
  projectRoot: string;
  extensions?: string[];
  useAliases?: boolean;
  plugins?: LanguagePlugin[];
  verbose?: boolean;
}

export interface PathAlias {
  pattern: string; // e.g. "@/*"
  prefix: string; // e.g. "@/"
  targetPrefix: string; // e.g. "src/"
}

export class ImportResolver {
  private exportCache: Map<string, ExportInfo[]> = new Map();
  private options: ResolverOptions;
  private pathAliases: PathAlias[] = [];

  private baseUrl?: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private chalkInstance: any = null;
  constructor(options: ResolverOptions) {
    this.options = {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      useAliases: true,
      ...options,
    };
  }

  async buildExportCache(): Promise<void> {
    // Cache chalk for synchronous use in resolveImport()
    try {
      const { default: chalk } = await import('chalk');
      this.chalkInstance = chalk;
    } catch {
      // chalk not available — warnings will be plain text
    }

    if (this.options.useAliases) {
      await this.loadPathAliases();
    }

    const pattern = `**/*{${this.options.extensions!.join(',')}}`;
    const files = await glob(pattern, {
      cwd: this.options.projectRoot,
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/__pycache__/**',
        '**/.venv/**',
        '**/venv/**',
      ],
      absolute: true,
      nodir: true,
    });

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const ext = path.extname(filePath);
        const plugin = getPluginForExtension(ext, this.options.plugins);
        const exports = plugin ? plugin.parseExports(content, filePath) : this.parseExportsLegacy(content, filePath);

        if (exports.length > 0) {
          this.exportCache.set(filePath, exports);
        }
      } catch (error: unknown) {
        if (this.options.verbose) {
          const msg = error instanceof Error ? error.message : String(error);
          try {
            const { default: chalk } = await import('chalk');
            console.warn(chalk.yellow(`Warning: Could not read file ${filePath}: ${msg}`));
          } catch {
            console.warn(`Warning: Could not read file ${filePath}: ${msg}`);
          }
        }
      }
    }

    // Second pass: resolve export * re-exports (1 level only)
    for (const [filePath, fileExports] of this.exportCache.entries()) {
      const starReExports = fileExports.filter((e) => e.name === '*' && e.reExportSource);
      if (starReExports.length === 0) continue;

      const additionalExports: ExportInfo[] = [];
      for (const starExport of starReExports) {
        const sourcePath = starExport.reExportSource!;
        // Skip external packages (only resolve relative paths)
        if (!sourcePath.startsWith('.') && !sourcePath.startsWith('/')) continue;

        const resolvedSource = this.resolveModulePath(filePath, sourcePath);
        if (resolvedSource) {
          const sourceExports = this.exportCache.get(resolvedSource);
          if (sourceExports) {
            for (const exp of sourceExports) {
              // Don't copy star re-exports (1 level only, no transitive)
              if (exp.name === '*' && exp.reExportSource) continue;
              additionalExports.push({ ...exp, source: filePath });
            }
          }
        }
      }

      // Remove star sentinel entries and add resolved exports
      const filtered = fileExports.filter((e) => !(e.name === '*' && e.reExportSource));
      filtered.push(...additionalExports);
      if (filtered.length > 0) {
        this.exportCache.set(filePath, filtered);
      } else {
        this.exportCache.delete(filePath);
      }
    }
  }

  resolveImport(identifier: string, currentFile: string): ExportInfo | null {
    // Collect all files that export this identifier (FIX #88)
    const allMatches: { filePath: string; exportInfo: ExportInfo }[] = [];
    for (const [filePath, exports] of this.exportCache.entries()) {
      if (filePath === currentFile) continue;

      const matchingExport = exports.find((exp) => exp.name === identifier);
      if (matchingExport) {
        allMatches.push({ filePath, exportInfo: matchingExport });
      }
    }

    if (allMatches.length === 0) return null;

    // Warn about ambiguous same-name exports when verbose
    if (allMatches.length > 1 && this.options.verbose) {
      const paths = allMatches.map((m) => m.filePath).join(', ');
      const warning = `Warning: "${identifier}" exported from multiple files: ${paths}. Using first match.`;
      if (this.chalkInstance) {
        console.warn(this.chalkInstance.yellow(warning));
      } else {
        console.warn(warning);
      }
    }

    // First-match-wins behavior (unchanged)
    const firstMatch = allMatches[0];
    const relativePath = this.getRelativeImportPath(currentFile, firstMatch.filePath);
    return {
      ...firstMatch.exportInfo,
      source: relativePath,
    };
  }

  private parseExportsLegacy(content: string, filePath: string): ExportInfo[] {
    const exports: ExportInfo[] = [];
    let match;

    const exportFunctionRegex = /export\s+(async\s+)?function\s+(\w+)/g;
    while ((match = exportFunctionRegex.exec(content)) !== null) {
      exports.push({ name: match[2], source: filePath, isDefault: false });
    }

    const exportVarRegex = /export\s+(const|let|var)\s+(\w+)/g;
    while ((match = exportVarRegex.exec(content)) !== null) {
      exports.push({ name: match[2], source: filePath, isDefault: false });
    }

    const exportClassRegex = /export\s+class\s+(\w+)/g;
    while ((match = exportClassRegex.exec(content)) !== null) {
      exports.push({ name: match[1], source: filePath, isDefault: false });
    }

    const exportInterfaceRegex = /export\s+interface\s+(\w+)/g;
    while ((match = exportInterfaceRegex.exec(content)) !== null) {
      exports.push({ name: match[1], source: filePath, isDefault: false, isType: true });
    }

    const exportTypeRegex = /export\s+type\s+(\w+)/g;
    while ((match = exportTypeRegex.exec(content)) !== null) {
      exports.push({ name: match[1], source: filePath, isDefault: false, isType: true });
    }

    const exportDefaultNameRegex = /export\s+default\s+(async\s+)?(class|function)\s+(\w+)/g;
    while ((match = exportDefaultNameRegex.exec(content)) !== null) {
      exports.push({ name: match[3], source: filePath, isDefault: true });
    }

    const exportNamedRegex = /export\s+\{([^}]+)\}/g;
    while ((match = exportNamedRegex.exec(content)) !== null) {
      const names = match[1]
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      names.forEach((name) => {
        const stripped = name.replace(/^type\s+/, '');
        const parts = stripped.split(/\s+as\s+/);
        const exportedName = parts[parts.length - 1].replace(/^type\s+/, '');
        exports.push({ name: exportedName, source: filePath, isDefault: false });
      });
    }

    return exports;
  }

  private async loadPathAliases(): Promise<void> {
    try {
      const tsconfigPath = path.join(this.options.projectRoot, 'tsconfig.json');
      // FIX #91: Follow tsconfig extends chain to merge compilerOptions
      const compilerOptions = await this.resolveTsconfigCompilerOptions(tsconfigPath, 5);

      const baseUrl = (compilerOptions.baseUrl as string) || '.';
      const paths: Record<string, string[]> = (compilerOptions.paths as Record<string, string[]>) || {};
      const resolvedBaseUrl = path.resolve(this.options.projectRoot, baseUrl);

      // FIX #90: Store baseUrl for non-relative import resolution
      if (compilerOptions.baseUrl) {
        this.baseUrl = compilerOptions.baseUrl as string;
      }
      for (const [aliasPattern, targets] of Object.entries(paths)) {
        if (!Array.isArray(targets) || targets.length === 0) continue;
        const target = targets[0];
        const hasWildcard = aliasPattern.includes('*');
        if (hasWildcard) {
          this.pathAliases.push({
            pattern: aliasPattern,
            prefix: aliasPattern.replace('*', ''),
            targetPrefix: path.resolve(resolvedBaseUrl, target.replace('*', '')) + path.sep,
          });
        } else {
          this.pathAliases.push({
            pattern: aliasPattern,
            prefix: aliasPattern,
            targetPrefix: path.resolve(resolvedBaseUrl, target),
          });
        }
      }
      this.pathAliases.sort((a, b) => b.prefix.length - a.prefix.length);
    } catch {
      this.pathAliases = [];
      this.baseUrl = undefined;
    }
  }

  // FIX #91: Recursively resolve tsconfig extends chain, merging compilerOptions (child overrides parent)
  private async resolveTsconfigCompilerOptions(
    tsconfigPath: string,
    maxDepth: number,
  ): Promise<Record<string, unknown>> {
    const content = await fs.readFile(tsconfigPath, 'utf-8');
    const tsconfig = JSON.parse(stripJsonComments(content));
    const compilerOptions: Record<string, unknown> = { ...(tsconfig.compilerOptions || {}) };

    if (typeof tsconfig.extends === 'string' && maxDepth > 0) {
      const extendsValue = tsconfig.extends;
      let parentPath: string;

      if (extendsValue.startsWith('.') || extendsValue.startsWith('/')) {
        // Relative or absolute path
        parentPath = path.resolve(path.dirname(tsconfigPath), extendsValue);
      } else {
        // Package reference (e.g. @tsconfig/node18)
        parentPath = path.join(this.options.projectRoot, 'node_modules', extendsValue, 'tsconfig.json');
      }

      // Add .json extension if not present
      if (!parentPath.endsWith('.json')) {
        parentPath += '.json';
      }

      try {
        const parentOptions = await this.resolveTsconfigCompilerOptions(parentPath, maxDepth - 1);
        // Parent as base, child overrides
        return { ...parentOptions, ...compilerOptions };
      } catch {
        // Parent config not found — use child's options only
      }
    }

    return compilerOptions;
  }

  private getAliasImportPath(toFile: string): string | null {
    const normalizedToFile = path.resolve(toFile);

    for (const alias of this.pathAliases) {
      const normalizedTarget = path.normalize(alias.targetPrefix);

      if (normalizedToFile.startsWith(normalizedTarget)) {
        const remainder = normalizedToFile.slice(normalizedTarget.length);
        const withoutExt = remainder.replace(/\\/g, '/').replace(/\.(ts|tsx|js|jsx|py)$/, '');
        return alias.prefix + withoutExt;
      }
    }

    return null;
  }

  private getBaseUrlImportPath(toFile: string): string | null {
    if (!this.baseUrl) return null;
    const resolvedBaseUrl = path.resolve(this.options.projectRoot, this.baseUrl);
    const normalizedToFile = path.resolve(toFile);
    if (normalizedToFile.startsWith(resolvedBaseUrl + path.sep)) {
      const remainder = normalizedToFile.slice(resolvedBaseUrl.length + 1);
      return remainder.replace(/\\/g, '/').replace(/\.(ts|tsx|js|jsx|py)$/, '');
    }
    return null;
  }

  private getRelativeImportPath(fromFile: string, toFile: string): string {
    if (this.pathAliases.length > 0) {
      const aliasPath = this.getAliasImportPath(toFile);
      if (aliasPath) return aliasPath;
    }
    // FIX #90: Try baseUrl-relative path
    if (this.baseUrl) {
      const baseUrlPath = this.getBaseUrlImportPath(toFile);
      if (baseUrlPath) return baseUrlPath;
    }
    const fromDir = path.dirname(fromFile);
    let relativePath = path.relative(fromDir, toFile).replace(/\\/g, '/');
    relativePath = relativePath.replace(/\.(ts|tsx|js|jsx|py)$/, '');
    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }
    return relativePath;
  }

  private resolveModulePath(fromFile: string, source: string): string | null {
    const dir = path.dirname(fromFile);
    const basePath = path.resolve(dir, source);

    // Try exact match
    if (this.exportCache.has(basePath)) return basePath;

    // Try with extensions
    for (const ext of this.options.extensions!) {
      const withExt = basePath + ext;
      if (this.exportCache.has(withExt)) return withExt;
    }

    // Try index files
    for (const ext of this.options.extensions!) {
      const indexPath = path.join(basePath, 'index' + ext);
      if (this.exportCache.has(indexPath)) return indexPath;
    }

    return null;
  }

  getExportCache(): Map<string, ExportInfo[]> {
    return this.exportCache;
  }

  getPathAliases(): PathAlias[] {
    return this.pathAliases;
  }
}

function stripJsonComments(text: string): string {
  // Single-pass regex: match strings first (priority), then comments
  // Strings take precedence — their content is preserved
  let result = text.replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_match, str) => str || '');
  // Remove trailing commas
  result = result.replace(/,\s*([}\]])/g, '$1');
  return result;
}
