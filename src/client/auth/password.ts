import {
  PASSWORD_KDF,
  PASSWORD_KDF_ITERATIONS,
  PASSWORD_PROOF_BYTES,
  PASSWORD_SALT_BYTES,
  type PasswordChallenge,
} from '../../shared/auth';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function newPasswordChallenge(): PasswordChallenge {
  return {
    algorithm: PASSWORD_KDF,
    iterations: PASSWORD_KDF_ITERATIONS,
    salt: bytesToBase64(crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES))),
  };
}

export async function derivePasswordProof(password: string, challenge: PasswordChallenge): Promise<string> {
  if (challenge.algorithm !== PASSWORD_KDF) throw new Error('Ukendt password-algoritme.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: base64ToBytes(challenge.salt), iterations: challenge.iterations },
    key,
    PASSWORD_PROOF_BYTES * 8,
  );
  return bytesToBase64(new Uint8Array(bits));
}
