import { describe, expect, it } from 'vitest';
import { hashPassword, randomToken, sha256, verifyPassword } from '../../src/server/auth/crypto';

describe('authentication crypto', () => {
  it('hashes and verifies a password without storing the password', async () => {
    const password = 'en-lang-og-staerk-adgangskode';
    const encoded = await hashPassword(password);
    expect(encoded).not.toContain(password);
    await expect(verifyPassword(password, encoded)).resolves.toBe(true);
    await expect(verifyPassword('forkert-adgangskode', encoded)).resolves.toBe(false);
  });

  it('creates unpredictable URL-safe session tokens', () => {
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
