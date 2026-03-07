jest.mock('chalk', () => {
  const fn = (s: string) => s;
  return {
    __esModule: true,
    default: Object.assign(fn, { blue: fn, gray: fn, green: fn, yellow: fn, red: fn, cyan: fn }),
  };
});

import { validateConfig, validateAndReportConfig } from '@/cli/configValidator';

describe('configValidator', () => {
  describe('validateConfig', () => {
    it('accepts a fully valid config', () => {
      const config = {
        extensions: ['.ts', '.tsx'],
        ignore: ['**/node_modules/**'],
        useAliases: true,
        verbose: false,
        dryRun: false,
        report: 'md',
        sortOrder: 'builtin,external,alias,relative',
        sort: true,
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('accepts an empty config', () => {
      const result = validateConfig({});

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('accepts a partial config with only some keys', () => {
      const result = validateConfig({ verbose: true, dryRun: true });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('warns on unknown keys without failing', () => {
      const config = { verbose: true, unknownKey: 'something', anotherUnknown: 42 };
      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings[0]).toContain('unknownKey');
      expect(result.warnings[1]).toContain('anotherUnknown');
    });

    it('errors when extensions is not an array of strings', () => {
      const result = validateConfig({ extensions: 'not-an-array' });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('`extensions` must be an array of strings');
    });

    it('errors when extensions array contains non-strings', () => {
      const result = validateConfig({ extensions: ['.ts', 42] });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('`extensions` must be an array of strings');
    });

    it('errors when ignore is not an array of strings', () => {
      const result = validateConfig({ ignore: true });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('`ignore` must be an array of strings');
    });

    it('errors when useAliases is not a boolean', () => {
      const result = validateConfig({ useAliases: 'yes' });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('`useAliases` must be a boolean');
    });

    it('errors when verbose is not a boolean', () => {
      const result = validateConfig({ verbose: 1 });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('`verbose` must be a boolean');
    });

    it('errors when dryRun is not a boolean', () => {
      const result = validateConfig({ dryRun: 'true' });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('`dryRun` must be a boolean');
    });

    it('errors when sort is not a boolean', () => {
      const result = validateConfig({ sort: 'yes' });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('`sort` must be a boolean');
    });

    it('errors when report is not a valid format', () => {
      const result = validateConfig({ report: 'xml' });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('`report` must be one of: md, json, txt, none');
    });

    it('errors when report is not a string', () => {
      const result = validateConfig({ report: 123 });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('`report` must be one of');
    });

    it('accepts all valid report formats', () => {
      for (const format of ['md', 'json', 'txt', 'none']) {
        const result = validateConfig({ report: format });
        expect(result.valid).toBe(true);
      }
    });

    it('errors when sortOrder contains invalid segments', () => {
      const result = validateConfig({ sortOrder: 'builtin,external,invalid' });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain(
        '`sortOrder` must be comma-separated list of: builtin,external,alias,relative',
      );
    });

    it('errors when sortOrder is not a string', () => {
      const result = validateConfig({ sortOrder: ['builtin', 'external'] });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('`sortOrder` must be comma-separated list of');
    });

    it('accepts valid partial sortOrder', () => {
      const result = validateConfig({ sortOrder: 'builtin,external' });
      expect(result.valid).toBe(true);
    });

    it('collects multiple errors from one config', () => {
      const config = {
        extensions: 'bad',
        verbose: 'bad',
        report: 'xml',
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(3);
    });

    it('returns both errors and warnings together', () => {
      const config = {
        verbose: 'bad',
        unknownKey: true,
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.warnings.length).toBe(1);
    });
  });

  describe('validateAndReportConfig', () => {
    let warnSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      errorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('returns config when valid', () => {
      const config = { verbose: true };
      const result = validateAndReportConfig(config, '.import-pilot.json');

      expect(result).toEqual(config);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('returns null and logs errors when invalid', () => {
      const config = { verbose: 'bad' };
      const result = validateAndReportConfig(config, '.import-pilot.json');

      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('logs warnings for unknown keys', () => {
      const config = { verbose: true, unknownKey: 'x' };
      const result = validateAndReportConfig(config, '.import-pilot.json');

      expect(result).toEqual(config);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unknownKey'));
    });

    it('includes config path in warning messages', () => {
      const config = { unknownKey: 'x' };
      validateAndReportConfig(config, '/path/to/.import-pilot.json');

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('/path/to/.import-pilot.json'));
    });
  });
});
