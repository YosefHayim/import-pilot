import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileScanner } from '@/scanner/fileScanner.js';
import { ImportResolver } from '@/resolver/importResolver.js';
import type { LanguagePlugin } from '@/plugins/languagePlugin.js';
import { getPluginForExtension, getDefaultPlugins, getAllExtensions } from '@/plugins/index.js';
import type { ReportFormat, ReportEntry, ReportData } from '@/reporter/reportGenerator.js';
import { writeReport } from '@/reporter/reportGenerator.js';
import { detectProjectLanguages } from '@/detector/languageDetector.js';
import { sortImports } from '@/sorter/importSorter.js';
import { validateAndReportConfig } from '@/cli/configValidator.js';

export const EXIT_CODE_OK = 0;
export const EXIT_CODE_ISSUES_FOUND = 1;
export const EXIT_CODE_CONFIG_ERROR = 2;

export interface CliOptions {
  dryRun?: boolean;
  verbose?: boolean;
  config?: string;
  extensions?: string;
  ignore?: string;
  alias?: boolean;
  report?: string;
  sort?: boolean;
  sortOrder?: string;
  quiet?: boolean;
  json?: boolean;
  globPattern?: string;
  watch?: boolean;
}

export interface JsonOutput {
  filesScanned: number;
  filesWithIssues: number;
  missingImports: { file: string; identifier: string; resolved: boolean; source: string | null }[];
  unresolved: { file: string; identifier: string }[];
}

export interface MissingImport {
  identifier: string;
  file: string;
  suggestion?: {
    source: string;
    isDefault: boolean;
  };
}

export class AutoImportCli {
  private scanner: FileScanner;
  private plugins: LanguagePlugin[];
  private resolver?: ImportResolver;

  constructor(plugins?: LanguagePlugin[]) {
    this.scanner = new FileScanner();
    this.plugins = plugins ?? getDefaultPlugins();
  }

  async run(directory: string, options: CliOptions = {}): Promise<number> {
    const startTime = Date.now();
    const quiet = !!options.quiet || !!options.json;
    const log = (...args: unknown[]) => {
      if (!quiet) console.log(...args);
    };

    log(chalk.blue('🔍 Import Pilot'));
    log(chalk.gray(`Scanning directory: ${directory}\n`));

    const projectRoot = path.resolve(directory);

    let extensions: string[];
    if (options.extensions) {
      extensions = options.extensions
        .split(',')
        .map((ext) => (ext.trim().startsWith('.') ? ext.trim() : '.' + ext.trim()));
    } else {
      const detected = await detectProjectLanguages(projectRoot);
      const supported = new Set(getAllExtensions(this.plugins));
      const filtered = detected.filter((ext) => supported.has(ext));
      if (filtered.length > 0) {
        extensions = filtered;
        if (options.verbose && !quiet) {
          console.log(chalk.gray(`Auto-detected extensions: ${filtered.join(', ')}`));
        }
      } else {
        extensions = getAllExtensions(this.plugins);
      }
    }

    log(chalk.yellow('Building export cache...'));
    this.resolver = new ImportResolver({
      projectRoot,
      extensions,
      useAliases: options.alias !== false,
      plugins: this.plugins,
      verbose: options.verbose && !quiet,
    });
    await this.resolver.buildExportCache();
    log(chalk.green('✓ Export cache built\n'));

    const ignore = options.ignore ? options.ignore.split(',').map((pattern) => pattern.trim()) : undefined;

    let files = await this.scanner.scan({
      cwd: projectRoot,
      extensions,
      ignore,
    });

    // Apply glob pattern filter if provided
    if (options.globPattern) {
      const { minimatch } = await import('minimatch');
      files = files.filter((f) => {
        const rel = path.relative(projectRoot, f.path);
        return minimatch(rel, options.globPattern!, { matchBase: true });
      });
    }

    log(chalk.gray(`Found ${files.length} files to analyze\n`));

    const allMissingImports: MissingImport[] = [];
    const reportEntries: ReportEntry[] = [];
    let filesWithIssues = 0;

    for (const file of files) {
      const plugin = getPluginForExtension(file.ext, this.plugins);
      if (!plugin) continue;

      const existingImports = plugin.parseImports(file.content, file.path);
      const usedIdentifiers = plugin.findUsedIdentifiers(file.content, file.path);

      const importedNames = new Set<string>();
      existingImports.forEach((imp) => {
        imp.imports.forEach((name) => {
          importedNames.add(name);
        });
      });

      // Parse exports from current file to avoid flagging locally defined identifiers
      const currentFileExports = plugin.parseExports(file.content, file.path);
      const exportedNames = new Set<string>();
      currentFileExports.forEach((exp) => {
        exportedNames.add(exp.name);
      });

      const missingIdentifiers = usedIdentifiers
        .map((id) => id.name)
        .filter((name, idx, self) => self.indexOf(name) === idx)
        .filter((name) => !importedNames.has(name))
        .filter((name) => !exportedNames.has(name))
        .filter((name) => !plugin.isBuiltInOrKeyword(name));

      if (missingIdentifiers.length > 0) {
        filesWithIssues++;

        if (options.verbose && !quiet) {
          console.log(chalk.yellow(`\n📄 ${path.relative(projectRoot, file.path)}`));
          console.log(chalk.gray(`   (${plugin.name})`));
        }

        for (const identifier of missingIdentifiers) {
          const resolution = this.resolver!.resolveImport(identifier, file.path);

          const missingImport: MissingImport = { identifier, file: file.path };
          const relFile = path.relative(projectRoot, file.path);

          if (resolution) {
            missingImport.suggestion = {
              source: resolution.source,
              isDefault: resolution.isDefault,
            };

            const stmt = plugin.generateImportStatement(identifier, resolution.source, resolution.isDefault);

            if (options.verbose && !quiet) {
              console.log(chalk.gray(`  - ${identifier}`) + chalk.green(` → ${stmt}`));
            }

            reportEntries.push({
              file: relFile,
              identifier,
              importStatement: stmt,
              source: resolution.source,
              isDefault: resolution.isDefault,
            });
          } else {
            if (options.verbose && !quiet) {
              console.log(chalk.gray(`  - ${identifier}`) + chalk.red(' → not found in project'));
            }

            reportEntries.push({
              file: relFile,
              identifier,
              importStatement: null,
              source: null,
              isDefault: false,
            });
          }

          allMissingImports.push(missingImport);
        }
      }
    }

    const resolvable = allMissingImports.filter((m) => m.suggestion).length;

    // JSON output mode — emit structured JSON and return early
    if (options.json) {
      const jsonOutput: JsonOutput = {
        filesScanned: files.length,
        filesWithIssues,
        missingImports: allMissingImports
          .filter((m) => m.suggestion)
          .map((m) => ({
            file: path.relative(projectRoot, m.file),
            identifier: m.identifier,
            resolved: true,
            source: m.suggestion!.source,
          })),
        unresolved: allMissingImports
          .filter((m) => !m.suggestion)
          .map((m) => ({
            file: path.relative(projectRoot, m.file),
            identifier: m.identifier,
          })),
      };
      console.log(JSON.stringify(jsonOutput, null, 2));
      return;
    }

    log(chalk.blue('\n\n📊 Summary:'));
    log(chalk.gray(`  Total files scanned: ${files.length}`));
    log(chalk.gray(`  Files with missing imports: ${filesWithIssues}`));
    log(chalk.gray(`  Total missing imports: ${allMissingImports.length}`));
    log(chalk.gray(`  Resolvable imports: ${resolvable}`));

    if (options.dryRun) {
      log(chalk.yellow('\n⚠️  Dry run mode - no files were modified'));
    } else {
      const fixable = allMissingImports.filter((m) => m.suggestion);
      if (fixable.length > 0) {
        log(chalk.blue(`\n✨ Applying ${fixable.length} fixes...`));
        await this.applyFixes(fixable, options.sort !== false, options.sortOrder);
        log(chalk.green('✓ Fixes applied successfully'));
      } else {
        log(chalk.yellow('\n⚠️  No resolvable imports found'));
      }
    }

    const reportFormat = (options.report || 'none') as ReportFormat;
    if (reportFormat !== 'none') {
      const durationMs = Date.now() - startTime;
      const reportData: ReportData = {
        timestamp: new Date().toISOString(),
        durationMs,
        directory: projectRoot,
        totalFilesScanned: files.length,
        filesWithMissing: filesWithIssues,
        totalMissing: allMissingImports.length,
        totalResolved: resolvable,
        totalUnresolved: allMissingImports.length - resolvable,
        dryRun: !!options.dryRun,
        entries: reportEntries,
      };

      const reportPath = await writeReport(projectRoot, reportFormat, reportData);
      if (reportPath) {
        log(chalk.green(`\n📝 Report written to ${chalk.cyan(path.relative(projectRoot, reportPath))}`));
      }
    }

    const hasUnresolved = allMissingImports.length > resolvable;
    if (allMissingImports.length === 0) return EXIT_CODE_OK;
    if (options.dryRun || hasUnresolved) return EXIT_CODE_ISSUES_FOUND;
    return EXIT_CODE_OK;
  }

  private getLanguageForExt(ext: string): string {
    const pythonExts = new Set(['.py']);
    const elixirExts = new Set(['.ex', '.exs']);
    const goExts = new Set(['.go']);
    const rustExts = new Set(['.rs']);
    if (pythonExts.has(ext)) return 'python';
    if (elixirExts.has(ext)) return 'elixir';
    if (goExts.has(ext)) return 'go';
    if (rustExts.has(ext)) return 'rust';
    return 'js';
  }

  async processFile(filePath: string, _projectRoot: string, options: CliOptions = {}): Promise<number> {
    const absolutePath = path.resolve(filePath);
    const ext = path.extname(absolutePath);
    const plugin = getPluginForExtension(ext, this.plugins);
    if (!plugin || !this.resolver) return 0;

    let content: string;
    try {
      content = await fs.readFile(absolutePath, 'utf-8');
    } catch {
      return 0;
    }

    const existingImports = plugin.parseImports(content, absolutePath);
    const usedIdentifiers = plugin.findUsedIdentifiers(content, absolutePath);

    const importedNames = new Set<string>();
    existingImports.forEach((imp) => {
      imp.imports.forEach((name) => importedNames.add(name));
    });

    const currentFileExports = plugin.parseExports(content, absolutePath);
    const exportedNames = new Set<string>();
    currentFileExports.forEach((exp) => exportedNames.add(exp.name));

    const missingIdentifiers = usedIdentifiers
      .map((id) => id.name)
      .filter((name, idx, self) => self.indexOf(name) === idx)
      .filter((name) => !importedNames.has(name))
      .filter((name) => !exportedNames.has(name))
      .filter((name) => !plugin.isBuiltInOrKeyword(name));

    const fixable: MissingImport[] = [];
    for (const identifier of missingIdentifiers) {
      const resolution = this.resolver.resolveImport(identifier, absolutePath);
      if (resolution) {
        fixable.push({
          identifier,
          file: absolutePath,
          suggestion: { source: resolution.source, isDefault: resolution.isDefault },
        });
      }
    }

    if (fixable.length > 0 && !options.dryRun) {
      await this.applyFixes(fixable, options.sort !== false, options.sortOrder);
    }

    return fixable.length;
  }

  async watch(directory: string, options: CliOptions = {}): Promise<() => Promise<void>> {
    const projectRoot = path.resolve(directory);

    let extensions: string[];
    if (options.extensions) {
      extensions = options.extensions
        .split(',')
        .map((ext) => (ext.trim().startsWith('.') ? ext.trim() : '.' + ext.trim()));
    } else {
      const detected = await detectProjectLanguages(projectRoot);
      const supported = new Set(getAllExtensions(this.plugins));
      const filtered = detected.filter((ext) => supported.has(ext));
      extensions = filtered.length > 0 ? filtered : getAllExtensions(this.plugins);
    }

    console.log(chalk.blue('🔍 Import Pilot — Watch Mode'));
    console.log(chalk.yellow('Building export cache...'));
    this.resolver = new ImportResolver({
      projectRoot,
      extensions,
      useAliases: options.alias !== false,
      plugins: this.plugins,
      verbose: options.verbose,
    });
    await this.resolver.buildExportCache();
    console.log(chalk.green('✓ Export cache built\n'));

    const extensionSet = new Set(extensions);
    const ignore = options.ignore ? options.ignore.split(',').map((p) => p.trim()) : [];
    const ignoredDirs = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/.git/**', ...ignore];

    const { watch: chokidarWatch } = await import('chokidar');

    const globs = extensions.map((ext) => path.join(projectRoot, '**', `*${ext}`));

    const watcher = chokidarWatch(globs, {
      ignored: ignoredDirs,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 100 },
    });

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingFiles = new Set<string>();

    const processPending = async () => {
      const files = [...pendingFiles];
      pendingFiles.clear();
      for (const filePath of files) {
        const ext = path.extname(filePath);
        if (!extensionSet.has(ext)) continue;
        try {
          const count = await this.processFile(filePath, projectRoot, options);
          const now = new Date();
          const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
          const relPath = path.relative(projectRoot, filePath);
          if (count > 0) {
            console.log(chalk.green(`[${timestamp}] ${relPath} changed → ${count} imports added`));
          } else {
            console.log(chalk.gray(`[${timestamp}] ${relPath} changed → no missing imports`));
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`Error processing ${filePath}: ${msg}`));
        }
      }
    };

    watcher.on('change', (filePath: string) => {
      pendingFiles.add(filePath);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void processPending();
      }, 300);
    });

    console.log(chalk.blue(`👀 Watching for changes in ${projectRoot}`));
    console.log(chalk.gray('Press Ctrl+C to stop\n'));

    const cleanup = async () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      await watcher.close();
      console.log(chalk.yellow('\n👋 Watch mode stopped'));
    };

    process.on('SIGINT', () => {
      void cleanup().then(() => process.exit(0));
    });

    return cleanup;
  }

  private async applyFixes(missingImports: MissingImport[], enableSort: boolean, sortOrder?: string): Promise<void> {
    const fileMap = new Map<string, MissingImport[]>();
    for (const item of missingImports) {
      if (!fileMap.has(item.file)) {
        fileMap.set(item.file, []);
      }
      fileMap.get(item.file)!.push(item);
    }

    for (const [filePath, imports] of fileMap.entries()) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const ext = path.extname(filePath);
        const plugin = getPluginForExtension(ext, this.plugins);
        if (!plugin) continue;
        const newImports: string[] = [];
        for (const item of imports) {
          if (item.suggestion) {
            newImports.push(
              plugin.generateImportStatement(item.identifier, item.suggestion.source, item.suggestion.isDefault),
            );
          }
        }

        if (newImports.length === 0) continue;
        const lang = this.getLanguageForExt(ext);
        const sortedImports = enableSort ? sortImports(newImports, lang, sortOrder) : newImports;
        const newContent = plugin.insertImports(content, sortedImports, filePath);
        await fs.writeFile(filePath, newContent, 'utf-8');
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`Error writing file ${filePath}: ${msg}`));
      }
    }
  }
}

export function createCli(): Command {
  const program = new Command();

  program
    .name('import-pilot')
    .description('Automatically scan and fix missing imports in your project')
    .version('1.0.0')
    .argument('[directory]', 'Directory to scan', '.')
    .option('-d, --dry-run', 'Show what would be changed without making changes')
    .option('-v, --verbose', 'Show detailed output')
    .option('-e, --extensions <extensions>', 'File extensions to scan (comma-separated, auto-detected if omitted)')
    .option('-i, --ignore <patterns>', 'Patterns to ignore (comma-separated)')
    .option('-c, --config <path>', 'Path to config file')
    .option('--no-alias', 'Disable tsconfig path alias resolution')
    .option('-r, --report <format>', 'Report format: md, json, txt, or none', 'none')
    .option('-s, --no-sort', 'Disable import sorting and grouping')
    .option(
      '--sort-order <order>',
      'Import sort order: builtin,external,alias,relative',
      'builtin,external,alias,relative',
    )
    .option('-q, --quiet', 'Suppress all stdout output except errors')
    .option('--json', 'Output scan results as JSON (implies --quiet for non-JSON output)')
    .option('-w, --watch', 'Watch for file changes and fix imports automatically')
    .action(async (directory: string, options: CliOptions) => {
      try {
        const hasGlobChars = /[*?{}\[\]]/.test(directory);
        if (hasGlobChars) {
          options.globPattern = directory;
          directory = '.';
        }

        const configPath = path.resolve(directory, options.config || '.import-pilot.json');
        let fileConfig: Record<string, unknown> | null = null;
        try {
          const raw = await fs.readFile(configPath, 'utf-8');
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          fileConfig = validateAndReportConfig(parsed, configPath);
          if (!fileConfig) {
            process.exit(1);
          }
        } catch {
          /* no config file or malformed JSON */
        }

        if (fileConfig) {
          const cfg = fileConfig as Record<string, any>;
          if (!options.extensions && cfg.extensions) {
            options.extensions = cfg.extensions.join(',');
          }
          if (!options.ignore && cfg.ignore) {
            options.ignore = cfg.ignore.join(',');
          }
          if (options.alias === undefined && cfg.useAliases !== undefined) {
            options.alias = cfg.useAliases;
          }
          if (options.dryRun === undefined && cfg.dryRun) {
            options.dryRun = cfg.dryRun;
          }
          if (options.verbose === undefined && cfg.verbose) {
            options.verbose = cfg.verbose;
          }
          if (options.report === 'none' && cfg.report && cfg.report !== 'none') {
            options.report = cfg.report;
          }
          if (options.sort === undefined && cfg.sort !== undefined) {
            options.sort = cfg.sort;
          }
          if (!options.sortOrder && cfg.sortOrder) {
            options.sortOrder = cfg.sortOrder;
          }
        }

        const cli = new AutoImportCli();
        if (options.watch) {
          await cli.watch(directory, options);
        } else {
          const exitCode = await cli.run(directory, options);
          process.exitCode = exitCode;
        }
      } catch (error) {
        console.error(chalk.red('\n❌ Error:'), error);
        process.exitCode = EXIT_CODE_CONFIG_ERROR;
      }
    });

  program
    .command('init')
    .description('Interactive setup wizard — configure import-pilot for your project')
    .argument('[directory]', 'Project directory', '.')
    .action(async (directory: string) => {
      try {
        const { runSetupWizard } = await import('./setupWizard.js');
        await runSetupWizard(path.resolve(directory));
      } catch (error) {
        console.error(chalk.red('\n❌ Error:'), error);
        process.exitCode = EXIT_CODE_CONFIG_ERROR;
      }
    });

  return program;
}
