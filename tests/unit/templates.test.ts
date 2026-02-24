import { describe, it, expect } from 'vitest';
import {
  getTemplate,
  getTemplateForDetection,
  getTemplateRules,
  getRulesForDetection,
  allTemplates,
} from '../../src/templates/index.js';
import { allRuleSets, getRulesFromSets } from '../../src/templates/rules.js';
import type { DetectionResult } from '../../src/detection/detector.js';

describe('templates', () => {
  it('has all expected templates', () => {
    const ids = Object.keys(allTemplates);
    expect(ids).toContain('typescript');
    expect(ids).toContain('react');
    expect(ids).toContain('nextjs');
    expect(ids).toContain('node-api');
    expect(ids).toContain('python');
    expect(ids).toContain('go');
    expect(ids).toContain('vue');
  });

  it('getTemplate returns template by id', () => {
    const t = getTemplate('react');
    expect(t).toBeDefined();
    expect(t!.name).toBe('React Application');
    expect(t!.baseRules).toContain('react');
  });

  it('getTemplate returns undefined for unknown id', () => {
    expect(getTemplate('nonexistent')).toBeUndefined();
  });

  it('every template has at least one base rule', () => {
    for (const [id, template] of Object.entries(allTemplates)) {
      expect(template.baseRules.length, `template ${id} has no base rules`).toBeGreaterThan(0);
    }
  });

  it('every base rule reference resolves to a rule set', () => {
    for (const [id, template] of Object.entries(allTemplates)) {
      for (const ruleRef of template.baseRules) {
        expect(allRuleSets[ruleRef], `template ${id} references missing ruleset ${ruleRef}`).toBeDefined();
      }
    }
  });
});

describe('getTemplateRules', () => {
  it('returns base rules + custom rules', () => {
    const template = getTemplate('nextjs')!;
    const rules = getTemplateRules(template);

    // Should include TypeScript rules, React rules, Next.js rules, and custom rules
    expect(rules.length).toBeGreaterThan(5);

    const ids = rules.map(r => r.id);
    expect(ids).toContain('ts-strict-mode'); // from typescript ruleset
    expect(ids).toContain('react-functional-components'); // from react ruleset
    expect(ids).toContain('nextjs-app-router'); // from nextjs ruleset
    expect(ids).toContain('nextjs-colocation'); // custom rule
  });
});

describe('getTemplateForDetection', () => {
  it('maps React detection to React template', () => {
    const detection: DetectionResult = {
      tech: {
        languages: ['typescript'],
        frameworks: ['react'],
        buildTools: ['vite'],
        testing: ['vitest'],
        databases: [],
        other: [],
      },
      configFiles: ['tsconfig.json', 'package.json'],
      summary: 'typescript/react project',
      confidence: 'high',
    };

    const template = getTemplateForDetection(detection);
    expect(template).toBeDefined();
    expect(template!.id).toBe('react');
  });

  it('maps Next.js detection to nextjs template', () => {
    const detection: DetectionResult = {
      tech: {
        languages: ['typescript'],
        frameworks: ['react', 'next.js'],
        buildTools: [],
        testing: [],
        databases: [],
        other: [],
      },
      configFiles: ['tsconfig.json'],
      summary: '',
      confidence: 'high',
    };

    const template = getTemplateForDetection(detection);
    expect(template!.id).toBe('nextjs');
  });

  it('returns undefined for generic detection', () => {
    const detection: DetectionResult = {
      tech: {
        languages: [],
        frameworks: [],
        buildTools: [],
        testing: [],
        databases: [],
        other: [],
      },
      configFiles: [],
      summary: '',
      confidence: 'low',
    };

    expect(getTemplateForDetection(detection)).toBeUndefined();
  });
});

describe('getRulesForDetection', () => {
  it('returns rules matching detected project type', () => {
    const detection: DetectionResult = {
      tech: {
        languages: ['python'],
        frameworks: ['fastapi'],
        buildTools: [],
        testing: ['pytest'],
        databases: [],
        other: [],
      },
      configFiles: ['pyproject.toml'],
      summary: '',
      confidence: 'high',
    };

    const rules = getRulesForDetection(detection);
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some(r => r.category === 'python')).toBe(true);
  });
});

describe('rule sets', () => {
  it('all rule sets have unique IDs within each set', () => {
    for (const [name, ruleSet] of Object.entries(allRuleSets)) {
      const ids = ruleSet.rules.map(r => r.id);
      const unique = new Set(ids);
      expect(unique.size, `duplicate IDs in ${name}`).toBe(ids.length);
    }
  });

  it('all rules have required fields', () => {
    for (const ruleSet of Object.values(allRuleSets)) {
      for (const rule of ruleSet.rules) {
        expect(rule.id).toBeTruthy();
        expect(rule.category).toBeTruthy();
        expect(rule.title).toBeTruthy();
        expect(rule.description).toBeTruthy();
      }
    }
  });

  it('getRulesFromSets combines multiple sets', () => {
    const rules = getRulesFromSets(['typescript', 'react']);
    const categories = new Set(rules.map(r => r.category));
    expect(categories.has('typescript')).toBe(true);
    expect(categories.has('react')).toBe(true);
  });

  it('getRulesFromSets ignores unknown set names', () => {
    const rules = getRulesFromSets(['typescript', 'nonexistent']);
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every(r => r.category === 'typescript')).toBe(true);
  });
});
