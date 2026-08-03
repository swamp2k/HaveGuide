import { describe, expect, it } from 'vitest';
import {
  createPasswordVerifier,
  randomPasswordChallenge,
  randomToken,
  readPasswordChallenge,
  sha256,
  verifyPasswordProof,
} from '../../src/server/auth/crypto';
import { PASSWORD_KDF_ITERATIONS } from '../../src/shared/auth';

function base64Bytes(length: number, offset = 0): string {
  return btoa(String.fromCharCode(...Array.from({ length }, (_, index) => (index + offset) % 256)));
}

describe('authentication crypto', () => {
  it('stores a server verifier rather than the reusable browser proof', async () => {
    const proof = base64Bytes(32, 7);
    const salt = base64Bytes(16, 19);
    const encoded = await createPasswordVerifier(proof, salt, PASSWORD_KDF_ITERATIONS);

    expect(encoded).not.toContain(proof);
    expect(readPasswordChallenge(encoded)).toEqual({
      algorithm: 'pbkdf2-sha256',
      iterations: PASSWORD_KDF_ITERATIONS,
      salt,
    });
    await expect(verifyPasswordProof(proof, encoded)).resolves.toEqual({
      valid: true,
      upgradedVerifier: null,
    });
    await expect(verifyPasswordProof(base64Bytes(32, 8), encoded)).resolves.toEqual({
      valid: false,
      upgradedVerifier: null,
    });
  });

  it('accepts and upgrades the previous PBKDF2 storage format without deriving inside the Worker', async () => {
    const proof = base64Bytes(32, 11);
    const salt = base64Bytes(16, 23);
    const legacy = `pbkdf2-sha256$${PASSWORD_KDF_ITERATIONS}$${salt}$${proof}`;
    const result = await verifyPasswordProof(proof, legacy);

    expect(result.valid).toBe(true);
    expect(result.upgradedVerifier).toMatch(/^client-pbkdf2-sha256\$/);
    expect(result.upgradedVerifier).not.toContain(proof);
  });

  it('creates unpredictable challenges and URL-safe session tokens', () => {
    const firstChallenge = randomPasswordChallenge();
    const secondChallenge = randomPasswordChallenge();
    expect(firstChallenge.salt).not.toEqual(secondChallenge.salt);
    expect(firstChallenge.iterations).toBe(PASSWORD_KDF_ITERATIONS);

    const first = randomToken();
    const second = randomToken();
    expect(first).not.toEqual(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(first.length).toBeGreaterThan(30);
  });

  it('creates stable hashes for stored session lookup', async () => {
    await expect(sha256('token')).resolves.toEqual(await sha256('token'));
    await expect(sha256('token')).resolves.not.toEqual(await sha256('andet-token'));
  });
});
