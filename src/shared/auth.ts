export const PASSWORD_KDF = 'pbkdf2-sha256';
export const PASSWORD_KDF_ITERATIONS = 210_000;
export const PASSWORD_SALT_BYTES = 16;
export const PASSWORD_PROOF_BYTES = 32;

export interface PasswordChallenge {
  algorithm: typeof PASSWORD_KDF;
  iterations: number;
  salt: string;
}
