import type { ImportStatement, UsedIdentifier } from '@/parser/astParser.js';
import type { ExportInfo } from '@/resolver/importResolver.js';

export interface ImportStyleOptions {
  quoteStyle?: 'single' | 'double';
  semicolons?: boolean;
  trailingComma?: boolean;
}

export const DEFAULT_STYLE_OPTIONS: ImportStyleOptions = {
  quoteStyle: 'single',
  semicolons: true,
  trailingComma: false,
};

export interface LanguagePlugin {
  readonly name: string;
  readonly extensions: string[];

  parseImports(content: string, filePath: string): ImportStatement[];
  findUsedIdentifiers(content: string, filePath: string): UsedIdentifier[];
  parseExports(content: string, filePath: string): ExportInfo[];
  isBuiltInOrKeyword(name: string): boolean;
  generateImportStatement(
    identifier: string,
    source: string,
    isDefault: boolean,
    styleOptions?: ImportStyleOptions,
  ): string;
  getImportInsertPosition(content: string, filePath: string): number;
  insertImports(content: string, imports: string[], filePath: string): string;
}
