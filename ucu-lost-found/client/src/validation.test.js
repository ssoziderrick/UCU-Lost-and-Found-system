// Unit tests for client-side validation (run: npm test)
import { describe, expect, test } from 'vitest';
import { normaliseId, validateActivationStart, validateClaim, validateLogin, validateNewPassword, validateReport } from './validation';

describe('client validation', () => {
  test('identifiers are normalised like the server does', () => {
    expect(normaliseId('  s24b23 /101 ')).toBe('S24B23/101');
  });
  test('login needs the identifier for the chosen account type', () => {
    expect(validateLogin({ registrationNumber: ' ', password: '' })).toEqual({
      registrationNumber: 'Enter your registration number.', password: 'Enter your password.',
    });
    expect(validateLogin({ staffId: 'STAFF-1', password: 'x' }, 'admin')).toEqual({});
  });
  test('activation accepts surname-first names with a comma', () => {
    expect(validateActivationStart({ registrationNumber: 'S24B23/101', fullName: 'Okello, Daniel' })).toEqual({});
    expect(validateActivationStart({ registrationNumber: '', fullName: 'D4niel' })).toHaveProperty('fullName');
  });
  test('new password: length, letter and number, identifier and confirmation', () => {
    expect(validateNewPassword({ password: 'short1', confirmPassword: 'short1' }).password).toMatch(/at least 10/);
    expect(validateNewPassword({ password: 'abcdefghijk', confirmPassword: 'abcdefghijk' }).password).toMatch(/number/);
    expect(validateNewPassword({ password: 'my-S24B23101-pw', confirmPassword: 'my-S24B23101-pw' }, ['S24B23/101']).password).toMatch(/registration number/);
    expect(validateNewPassword({ password: 'Campus-Return-2026', confirmPassword: 'x' }).confirmPassword).toMatch(/don’t match/);
    expect(validateNewPassword({ password: 'Campus-Return-2026', confirmPassword: 'Campus-Return-2026' })).toEqual({});
  });
  test('report: future date, missing fields and oversized photo', () => {
    const e = validateReport({ type: '', title: 'a', description: '', eventDate: '2999-01-01', photos: [{ name: 'big.png', type: 'image/png', size: 6e6 }] });
    expect(Object.keys(e)).toEqual(expect.arrayContaining(['type', 'title', 'categoryId', 'description', 'eventDate', 'locationId', 'photos']));
    expect(e.photos).toMatch(/big\.png.*5 MB/);
    expect(validateReport({ photos: Array(3).fill({ name: 'a.png', type: 'image/png', size: 10 }), existingPhotoCount: 2 }).photos).toMatch(/at most 4/);
    expect(validateReport({ photos: [{ name: 'x.gif', type: 'image/gif', size: 10 }] }).photos).toMatch(/x\.gif/);
  });
  test('claim: evidence must be at least 20 characters', () => {
    expect(validateClaim({ evidence: 'mine' }).evidence).toBeDefined();
    expect(validateClaim({ evidence: 'The keyring has D.O. RM 14 scratched on it.' })).toEqual({});
  });
});
