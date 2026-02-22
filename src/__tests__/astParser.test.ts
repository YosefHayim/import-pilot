import { AstParser } from '@/parser/astParser';

describe('AstParser', () => {
  let parser: AstParser;

  beforeEach(() => {
    parser = new AstParser();
  });

  describe('parse', () => {
    it('should detect existing imports', () => {
      const content = `
import { useState } from 'react';
import Button from './Button';

export function MyComponent() {
  return <div>Test</div>;
}
`;

      const result = parser.parse(content);

      expect(result.existingImports).toHaveLength(2);
      expect(result.existingImports[0].source).toBe('react');
      expect(result.existingImports[0].imports).toContain('useState');
      expect(result.existingImports[1].source).toBe('./Button');
      expect(result.existingImports[1].isDefault).toBe(true);
    });

    it('should detect JSX components usage', () => {
      const content = `
export function MyComponent() {
  return (
    <div>
      <Card>
        <Button onClick={handleClick}>Click</Button>
      </Card>
    </div>
  );
}
`;

      const result = parser.parse(content);

      expect(result.usedIdentifiers.some((id) => id.name === 'Card')).toBe(true);
      expect(result.usedIdentifiers.some((id) => id.name === 'Button')).toBe(true);
    });

    it('should detect function calls', () => {
      const content = `
export function MyComponent() {
  const name = formatName('John', 'Doe');
  return <div>{name}</div>;
}
`;

      const result = parser.parse(content);

      expect(result.usedIdentifiers.some((id) => id.name === 'formatName')).toBe(true);
    });

    it('should not detect method calls as missing imports', () => {
      const content = `
export function MyComponent() {
  const str = 'hello';
  const upper = str.toUpperCase();
  return <div>{upper}</div>;
}
`;

      const result = parser.parse(content);

      expect(result.missingImports).not.toContain('toUpperCase');
    });

    it('should identify missing imports', () => {
      const content = `
export function MyComponent() {
  return <Card><Button>Click</Button></Card>;
}
`;

      const result = parser.parse(content);

      expect(result.missingImports).toContain('Card');
      expect(result.missingImports).toContain('Button');
    });

    it('should not mark imported items as missing', () => {
      const content = `
import { Card } from './Card';

export function MyComponent() {
  return <Card>Content</Card>;
}
`;

      const result = parser.parse(content);

      expect(result.missingImports).not.toContain('Card');
    });

    it('should handle namespace imports', () => {
      const content = `
import * as React from 'react';

export function MyComponent() {
  return <div>Test</div>;
}
`;

      const result = parser.parse(content);

      expect(result.existingImports[0].isNamespace).toBe(true);
      expect(result.existingImports[0].imports).toContain('React');
    });
  });

  describe('FIX #74: type-only imports should not be captured', () => {
    it('should not capture type-only default imports', () => {
      const result = parser.parse("import type React from 'react';");
      const defaultImports = result.existingImports.filter((i) => i.isDefault);
      expect(defaultImports).toHaveLength(0);
    });

    it('should not capture type-only named imports', () => {
      const result = parser.parse("import type { FC, ReactNode } from 'react';");
      const namedImports = result.existingImports.filter((i) => !i.isDefault && !i.isNamespace);
      expect(namedImports).toHaveLength(0);
    });

    it('should not capture type-only namespace imports', () => {
      const result = parser.parse("import type * as NS from 'module';");
      const nsImports = result.existingImports.filter((i) => i.isNamespace);
      expect(nsImports).toHaveLength(0);
    });

    it('should still capture regular default imports (regression guard)', () => {
      const result = parser.parse("import React from 'react';");
      expect(result.existingImports).toHaveLength(1);
      expect(result.existingImports[0].isDefault).toBe(true);
      expect(result.existingImports[0].imports).toContain('React');
    });

    it('should still capture regular named imports (regression guard)', () => {
      const result = parser.parse("import { FC, useState } from 'react';");
      expect(result.existingImports).toHaveLength(1);
      expect(result.existingImports[0].imports).toContain('FC');
      expect(result.existingImports[0].imports).toContain('useState');
    });

    it('should still capture regular namespace imports (regression guard)', () => {
      const result = parser.parse("import * as React from 'react';");
      expect(result.existingImports).toHaveLength(1);
      expect(result.existingImports[0].isNamespace).toBe(true);
      expect(result.existingImports[0].imports).toContain('React');
    });
  });
  describe('FIX 5b: isKeyword should only suppress Vue compiler macros', () => {
    it('should treat framework symbols as importable (not keywords)', () => {
      const result = parser.parse(`
const svc = Injectable({ providedIn: 'root' });
const router = Router();
`);
      expect(result.missingImports).not.toContain('defineProps');
      expect(result.missingImports).not.toContain('defineEmits');
    });

    it('should not suppress Angular/React/Next.js symbols', () => {
      const isKeyword = (parser as any).isKeyword.bind(parser);
      expect(isKeyword('Injectable')).toBe(false);
      expect(isKeyword('Observable')).toBe(false);
      expect(isKeyword('Router')).toBe(false);
      expect(isKeyword('Component')).toBe(false);
      expect(isKeyword('GetServerSideProps')).toBe(false);
      expect(isKeyword('SvelteComponent')).toBe(false);
    });

    it('should still suppress Vue compiler macros', () => {
      const isKeyword = (parser as any).isKeyword.bind(parser);
      expect(isKeyword('defineProps')).toBe(true);
      expect(isKeyword('defineEmits')).toBe(true);
      expect(isKeyword('defineExpose')).toBe(true);
      expect(isKeyword('defineSlots')).toBe(true);
      expect(isKeyword('withDefaults')).toBe(true);
    });
  });

  describe('FIX #78: optional chaining should not capture method as identifier', () => {
    it('should not capture method in optional chaining obj?.method()', () => {
      const content = `
export function MyComponent() {
  const result = obj?.method();
  return <div>{result}</div>;
}
`;
      const result = parser.parse(content);
      expect(result.usedIdentifiers.some((id) => id.name === 'method')).toBe(false);
    });

    it('should still not capture method in dot notation obj.method() (regression guard)', () => {
      const content = `
export function MyComponent() {
  const result = obj.method();
  return <div>{result}</div>;
}
`;
      const result = parser.parse(content);
      expect(result.usedIdentifiers.some((id) => id.name === 'method')).toBe(false);
    });

    it('should still capture bare function call method() (regression guard)', () => {
      const content = `
export function MyComponent() {
  const result = method();
  return <div>{result}</div>;
}
`;
      const result = parser.parse(content);
      expect(result.usedIdentifiers.some((id) => id.name === 'method')).toBe(true);
    });
  });

  describe('FIX #76: dynamic import() expressions should be recognized', () => {
    it('should recognize await import("./module") as an existing import', () => {
      const content = `const mod = await import('./module');`;
      const result = parser.parse(content);
      expect(result.existingImports.some((i) => i.source === './module')).toBe(true);
    });

    it('should recognize import("./utils/helper") without await', () => {
      const content = `import('./utils/helper');`;
      const result = parser.parse(content);
      expect(result.existingImports.some((i) => i.source === './utils/helper')).toBe(true);
    });

    it('should NOT recognize template literal dynamic imports (skipped gracefully)', () => {
      const content = 'const mod = import(`./modules/${name}`);';
      const result = parser.parse(content);
      expect(result.existingImports).toHaveLength(0);
    });

    it('should still recognize regular static imports (regression guard)', () => {
      const content = `
import { useState } from 'react';
import Button from './Button';
const mod = await import('./dynamic');
`;
      const result = parser.parse(content);
      expect(result.existingImports.some((i) => i.source === 'react')).toBe(true);
      expect(result.existingImports.some((i) => i.source === './Button')).toBe(true);
      expect(result.existingImports.some((i) => i.source === './dynamic')).toBe(true);
      expect(result.existingImports).toHaveLength(3);
    });
  });
});
