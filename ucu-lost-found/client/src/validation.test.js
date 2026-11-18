// Unit tests for client-side validation (run: npm test)
import { describe, expect, test } from 'vitest';
import { validateClaim, validateRegister, validateReport } from './validation';

describe('client validation', () => {
  test('register: mismatched passwords and weak password are reported', () => {
    const e = validateRegister({ fullName: 'Ann', email: 'ann@x.test', password: 'abcdefgh', confirmPassword: 'x' });
    expect(e.password).toMatch(/letter and one number/);
    expect(e.confirmPassword).toMatch(/do not match/);
  });
  test('register: valid input has no errors', () => {
    expect(validateRegister({ fullName: 'Ann Akello', email: 'ann@x.test', password: 'abcd1234', confirmPassword: 'abcd1234' })).toEqual({});
  });
  test('report: future date, missing fields and oversized photo', () => {
    const e = validateReport({ type: '', title: 'a', description: '', eventDate: '2999-01-01', photo: { type: 'image/png', size: 5e6 } });
    expect(Object.keys(e)).toEqual(expect.arrayContaining(['type', 'title', 'categoryId', 'description', 'eventDate', 'locationId', 'photo']));
  });
  test('claim: evidence must be at least 20 characters', () => {
    expect(validateClaim({ evidence: 'mine' }).evidence).toBeDefined();
    expect(validateClaim({ evidence: 'The keyring has D.O. RM 14 scratched on it.' })).toEqual({});
  });
});
