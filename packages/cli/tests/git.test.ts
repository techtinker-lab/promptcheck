import { describe, expect, it } from 'vitest';
import { sanitizeAuthorName } from '../src/git/info.js';

describe('Git Metadata LGPD Compliance', () => {
  it('discards email addresses from author name to protect PII', () => {
    expect(sanitizeAuthorName('dev@techtinker.com.br')).toBeNull();
    expect(sanitizeAuthorName('Rafael <dev@techtinker.com.br>')).toBeNull();
    expect(sanitizeAuthorName('john.doe@gmail.com')).toBeNull();
  });

  it('keeps clean public usernames and handles', () => {
    expect(sanitizeAuthorName('rafael-techtinker')).toBe('rafael-techtinker');
    expect(sanitizeAuthorName('John Doe')).toBe('John Doe');
    expect(sanitizeAuthorName('octocat')).toBe('octocat');
  });

  it('handles null, undefined and empty strings', () => {
    expect(sanitizeAuthorName(null)).toBeNull();
    expect(sanitizeAuthorName(undefined)).toBeNull();
    expect(sanitizeAuthorName('   ')).toBeNull();
  });
});
