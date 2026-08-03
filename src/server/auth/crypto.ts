import {
  PASSWORD_KDF,
  PASSWORD_KDF_ITERATIONS,
  PASSWORD_PROOF_BYTES,
  PASSWORD_SALT_BYTES,
  type PasswordChallenge,
} from '../../shared/auth';

const encoder = new TextEncoder();
const VERIFIER_ALGORITHM = 'client-pbkdf2-sha256';
const LEGACY_ALGORITHM = 'pbkdf2-sha256';
const VERIFIER_DOMAIN = 'have-guide-password-proof-v1|';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function parseEncodedPassword(encoded: string): {
  algorithm: string;
  iterations: number;
  salt: string;
  verifier: string;
} | null {
  const [algorithm, iterationsRaw, salt, verifier] = encoded.split('$');
  const iterations = Number.parseInt(iterationsRaw ?? '', 10);
  if (!algorithm || !salt || !verifier || !Number.isSafeInteger(iterations)) return null;
  const saltBytes = base64ToBytes(salt);
  const verifierBytes = base64ToBytes(verifier);
  if (saltBytes?.byteLength !== PASSWORD_SALT_BYTES || verifierBytes?.byteLength !== PASSWORD_PROOF_BYTES) return null;
  return { algorithm, iterations, salt, verifier };
}

async function proofDigest(proof: string): Promise<string> {
  return sha256(`${VERIFIER_DOMAIN}${proof}`);
}

export function randomPasswordChallenge(): PasswordChallenge {
  return {
    algorithm: PASSWORD_KDF,
    iterations: PASSWORD_KDF_ITERATIONS,
    salt: bytesToBase64(crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES))),
  };
}

export function readPasswordChallenge(encoded: string): PasswordChallenge | null {
  const parsed = parseEncodedPassword(encoded);
  if (!parsed || ![VERIFIER_ALGORITHM, LEGACY_ALGORITHM].includes(parsed.algorithm)) return null;
  if (parsed.iterations < 100_000 || parsed.iterations > 1_000_000) return null;
  return { algorithm: PASSWORD_KDF, iterations: parsed.iterations, salt: parsed.salt };
}

export async function createPasswordVerifier(
  proof: string,
  salt: string,
  iterations: number,
): Promise<string> {
  const proofBytes = base64ToBytes(proof);
  const saltBytes = base64ToBytes(salt);
  if (proofBytes?.byteLength !== PASSWORD_PROOF_BYTES) throw new Error('Invalid password proof.');
  if (saltBytes?.byteLength !== PASSWORD_SALT_BYTES) throw new Error('Invalid password salt.');
  if (iterations !== PASSWORD_KDF_ITERATIONS) throw new Error('Invalid password iteration count.');
  return `${VERIFIER_ALGORITHM}$${iterations}$${salt}$${await proofDigest(proof)}`;
}

export async function verifyPasswordProof(
  proof: string,
  encoded: string,
): Promise<{ valid: boolean; upgradedVerifier: string | null }> {
  const parsed = parseEncodedPassword(encoded);
  const proofBytes = base64ToBytes(proof);
  if (!parsed || proofBytes?.byteLength !== PASSWORD_PROOF_BYTES) {
    await proofDigest(proof);
    return { valid: false, upgradedVerifier: null };
  }

  if (parsed.algorithm === VERIFIER_ALGORITHM) {
    const actual = base64ToBytes(await proofDigest(proof));
    const expected = base64ToBytes(parsed.verifier);
    return {
      valid: Boolean(actual && expected && constantTimeEqual(actual, expected)),
      upgradedVerifier: null,
    };
  }

  if (parsed.algorithm === LEGACY_ALGORITHM) {
    const expected = base64ToBytes(parsed.verifier);
    const valid = Boolean(expected && constantTimeEqual(proofBytes, expected));
    return {
      valid,
      upgradedVerifier: valid
        ? await createPasswordVerifier(proof, parsed.salt, parsed.iterations)
        : null,
    };
  }

  await proofDigest(proof);
  return { valid: false, upgradedVerifier: null };
}

export function randomToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}
