import { DEFAULT_FAQ_PROJECT_KEY } from '../faq/faq-project-key.util';
import {
  applyTourProjectScopeFilter,
  isGenericProjectTourScope,
  readTourProjectKeyFromEntity,
} from './tour-project-scope.util';

describe('tour-project-scope.util', () => {
  describe('isGenericProjectTourScope', () => {
    it('treats default and empty as generic', () => {
      expect(isGenericProjectTourScope('default')).toBe(true);
      expect(isGenericProjectTourScope('')).toBe(true);
      expect(isGenericProjectTourScope(undefined)).toBe(true);
    });

    it('treats SDK keys as scoped', () => {
      expect(isGenericProjectTourScope('test-11-v1')).toBe(false);
    });
  });

  describe('applyTourProjectScopeFilter', () => {
    it('applies exact match for SDK project keys', () => {
      const calls: Array<{ sql: string; params?: Record<string, unknown> }> = [];
      applyTourProjectScopeFilter((sql, params) => calls.push({ sql, params }), 'test-11-v1');
      expect(calls).toHaveLength(1);
      expect(calls[0].params).toEqual({ flowVersion: 'test-11-v1' });
    });

    it('filters unscoped tours for generic default project', () => {
      const calls: Array<{ sql: string; params?: Record<string, unknown> }> = [];
      applyTourProjectScopeFilter((sql, params) => calls.push({ sql, params }), DEFAULT_FAQ_PROJECT_KEY);
      expect(calls).toHaveLength(1);
      expect(calls[0].sql).toContain('IS NULL');
      expect(calls[0].sql).toContain("= ''");
      expect(calls[0].sql).toContain(':sdkLabPath');
      expect(calls[0].params?.sdkLabPath).toBeDefined();
    });
  });

  describe('readTourProjectKeyFromEntity', () => {
    it('reads project key from trigger conditions', () => {
      expect(
        readTourProjectKeyFromEntity({
          triggerConditions: { contextualEngine: { flowVersion: 'test-10-v1' } },
        }),
      ).toBe('test-10-v1');
      expect(readTourProjectKeyFromEntity({ triggerConditions: {} })).toBe(DEFAULT_FAQ_PROJECT_KEY);
    });
  });
});
