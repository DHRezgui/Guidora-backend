import {
  assertDeletableProjectScopeKey,
  assertProjectScopeDeleteConfirmation,
} from './project-scope-delete.util';

describe('project-scope-delete.util', () => {
  it('rejects default project', () => {
    expect(() => assertDeletableProjectScopeKey('default')).toThrow('générique');
  });

  it('rejects lab project keys', () => {
    expect(() => assertDeletableProjectScopeKey('integration-health-v1')).toThrow('lab SDK');
  });

  it('accepts SDK project keys', () => {
    expect(assertDeletableProjectScopeKey('test-10-v1')).toBe('test-10-v1');
  });

  it('requires exact confirmation key', () => {
    expect(() =>
      assertProjectScopeDeleteConfirmation('test-10-v1', 'test-11-v1'),
    ).toThrow('confirmation');
    expect(() => assertProjectScopeDeleteConfirmation('test-10-v1', '')).toThrow();
  });

  it('accepts matching confirmation', () => {
    expect(() =>
      assertProjectScopeDeleteConfirmation('test-10-v1', 'test-10-v1'),
    ).not.toThrow();
  });
});
