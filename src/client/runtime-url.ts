import { Capacitor } from '@capacitor/core';

export const PRODUCTION_ORIGIN = 'https://have-guide.sr-goodjob.workers.dev';

export function isNativeRuntime(): boolean {
  return Capacitor.isNativePlatform();
}

function nativeApiUrl(value: string): string {
  if (value.startsWith('/api/')) return `${PRODUCTION_ORIGIN}${value}`;

  try {
    const parsed = new URL(value);
    const localNativeHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (localNativeHost && parsed.pathname.startsWith('/api/')) {
      return `${PRODUCTION_ORIGIN}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return value;
  }

  return value;
}

export function runtimeUrl(path: string): string {
  if (!isNativeRuntime()) return path;
  return nativeApiUrl(path);
}

export function installNativeFetchUrlBridge(): void {
  if (!isNativeRuntime()) return;
  const nativeFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') return nativeFetch(runtimeUrl(input), init);
    if (input instanceof URL) return nativeFetch(runtimeUrl(input.toString()), init);
    if (input instanceof Request) {
      const nextUrl = runtimeUrl(input.url);
      return nativeFetch(nextUrl === input.url ? input : new Request(nextUrl, input), init);
    }
    return nativeFetch(input, init);
  }) as typeof globalThis.fetch;
}

export function normalizeRuntimeUrls<T>(value: T): T {
  if (!isNativeRuntime()) return value;

  const visit = (current: unknown): unknown => {
    if (typeof current === 'string') {
      return current.startsWith('/api/') ? runtimeUrl(current) : current;
    }
    if (Array.isArray(current)) return current.map(visit);
    if (current && typeof current === 'object') {
      return Object.fromEntries(
        Object.entries(current).map(([key, item]) => [key, visit(item)]),
      );
    }
    return current;
  };

  return visit(value) as T;
}
