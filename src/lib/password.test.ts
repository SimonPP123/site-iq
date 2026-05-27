/**
 * Unit tests for the shared password policy.
 *
 * Both the sign-up and reset-password forms call validatePassword, so these cases lock the policy
 * in one place: min 8 chars AND at least one lowercase, one uppercase, and one number.
 *
 * Inputs live in a data table rather than inline calls, so the suite stays declarative (add a row,
 * not a block) and the fixtures read as test data.
 */

import { describe, it, expect } from 'vitest';
import { validatePassword, MIN_PASSWORD_LENGTH } from './password';

// A fixture sitting exactly at the minimum length, derived from the constant so the test stays
// meaningful (and valid) even if the minimum changes: uppercase + lowercase + a digit.
const atMinimumLength = 'Abc1'.padEnd(MIN_PASSWORD_LENGTH, 'x');

// [input, expected] - `null` means accepted; a RegExp means rejected with a message that matches it.
const cases: ReadonlyArray<readonly [string, RegExp | null]> = [
  ['Abcdef12', null], // meets every rule
  ['Wxyz-87-mix', null], // longer, includes a symbol
  [atMinimumLength, null], // exactly the minimum length
  ['Ab1cde', /at least/i], // too short
  ['abcdef12', /uppercase/i], // missing an uppercase letter
  ['ABCDEF12', /lowercase/i], // missing a lowercase letter
  ['Abcdefgh', /number/i], // missing a digit
  ['', /at least/i], // empty
];

describe('validatePassword', () => {
  for (const [input, expected] of cases) {
    const label = input === '' ? '(empty)' : input;
    const verb = expected === null ? 'accepts' : 'rejects';
    it(`${verb} ${label}`, () => {
      const result = validatePassword(input);
      if (expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).toMatch(expected);
      }
    });
  }
});
