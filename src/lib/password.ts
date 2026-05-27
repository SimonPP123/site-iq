/**
 * Single source of truth for the password strength policy, shared by the sign-up and
 * reset-password forms so the two cannot drift apart. The rule: at least 8 characters, with at
 * least one lowercase letter, one uppercase letter, and one number.
 */

/** Minimum password length, also used to set the `minLength` attribute on the inputs. */
export const MIN_PASSWORD_LENGTH = 8;

/** Human-readable description of the policy - used for the helper hint under the field. */
export const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters, with a lowercase letter, an uppercase letter and a number.`;

/**
 * Validate a candidate password against the shared policy.
 * Returns an error message to show the user, or `null` when the password is acceptable.
 */
export function validatePassword(password: string): string | null {
    if (password.length < MIN_PASSWORD_LENGTH) {
        return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
        return "Password must include a lowercase letter, an uppercase letter and a number.";
    }
    return null;
}
