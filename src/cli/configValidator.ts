import chalk from 'chalk';

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const VALID_REPORT_FORMATS = ['md', 'json', 'txt', 'none'] as const;
const VALID_SORT_ORDER_SEGMENTS = ['builtin', 'external', 'alias', 'relative'] as const;

const KNOWN_KEYS: Record<string, string> = {
  extensions: 'string[]',
  ignore: 'string[]',
  useAliases: 'boolean',
  verbose: 'boolean',
  dryRun: 'boolean',
  report: 'string',
  sortOrder: 'string',
  sort: 'boolean',
};

export function validateConfig(config: Record<string, unknown>): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const key of Object.keys(config)) {
    if (!(key in KNOWN_KEYS)) {
      warnings.push(`Unknown config key: \`${key}\``);
    }
  }

  if ('extensions' in config) {
    const val = config.extensions;
    if (!Array.isArray(val) || !val.every((v) => typeof v === 'string')) {
      errors.push('Invalid config: `extensions` must be an array of strings');
    }
  }

  if ('ignore' in config) {
    const val = config.ignore;
    if (!Array.isArray(val) || !val.every((v) => typeof v === 'string')) {
      errors.push('Invalid config: `ignore` must be an array of strings');
    }
  }

  if ('useAliases' in config) {
    if (typeof config.useAliases !== 'boolean') {
      errors.push('Invalid config: `useAliases` must be a boolean');
    }
  }

  if ('verbose' in config) {
    if (typeof config.verbose !== 'boolean') {
      errors.push('Invalid config: `verbose` must be a boolean');
    }
  }

  if ('dryRun' in config) {
    if (typeof config.dryRun !== 'boolean') {
      errors.push('Invalid config: `dryRun` must be a boolean');
    }
  }

  if ('sort' in config) {
    if (typeof config.sort !== 'boolean') {
      errors.push('Invalid config: `sort` must be a boolean');
    }
  }

  if ('report' in config) {
    const val = config.report;
    if (typeof val !== 'string' || !(VALID_REPORT_FORMATS as readonly string[]).includes(val)) {
      errors.push(`Invalid config: \`report\` must be one of: ${VALID_REPORT_FORMATS.join(', ')}`);
    }
  }

  if ('sortOrder' in config) {
    const val = config.sortOrder;
    if (typeof val !== 'string') {
      errors.push(
        `Invalid config: \`sortOrder\` must be comma-separated list of: ${VALID_SORT_ORDER_SEGMENTS.join(',')}`,
      );
    } else {
      const segments = val.split(',').map((s) => s.trim());
      const invalidSegments = segments.filter((s) => !(VALID_SORT_ORDER_SEGMENTS as readonly string[]).includes(s));
      if (invalidSegments.length > 0) {
        errors.push(
          `Invalid config: \`sortOrder\` must be comma-separated list of: ${VALID_SORT_ORDER_SEGMENTS.join(',')}`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateAndReportConfig(
  config: Record<string, unknown>,
  configPath: string,
): Record<string, unknown> | null {
  const result = validateConfig(config);

  for (const warning of result.warnings) {
    console.warn(chalk.yellow(`⚠️  ${warning} (in ${configPath})`));
  }

  if (!result.valid) {
    for (const error of result.errors) {
      console.error(chalk.red(`❌ ${error}`));
    }
    return null;
  }

  return config;
}
