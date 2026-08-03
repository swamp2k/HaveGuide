import {
  PASSWORD_KDF,
  PASSWORD_KDF_ITERATIONS,
  PASSWORD_PROOF_BYTES,
  PASSWORD_SALT_BYTES,
  type PasswordChallenge,
} from '../../shared/auth';

const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function createPasswordChallenge(): PasswordChallenge {
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  return {
    algorithm: PASSWORD_KDF,
    iterations: PASSWORD_KDF_ITERATIONS,
    salt: bytesToBase64(salt),
  };
}

export async function derivePasswordProof(password: string, challenge: PasswordChallenge): Promise<string> {
  if (challenge.algorithm !== PASSWORD_KDF) throw new Error('Passwordalgoritmen understøttes ikke.');
  if (!Number.isSafeInteger(challenge.iterations) || challenge.iterations < 100_000 || challenge.iterations > 1_000_000) {
    throw new Error('Passwordindstillingerne er ugyldige.');
  }
  const salt = base64ToBytes(challenge.salt);
  if (salt.byteLength !== PASSWORD_SALT_BYTES) throw new Error('Password-saltet er ugyldigt.');

  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations: challenge.iterations },
    key,
    PASSWORD_PROOF_BYTES * 8,
  );
  return bytesToBase64(new Uint8Array(bits));
}
