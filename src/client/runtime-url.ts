import { Capacitor } from '@capacitor/core';

export const PRODUCTION_ORIGIN = 'https://have-guide.sr-goodjob.workers.dev';

export function isNativeRuntime(): boolean {
  return Capacitor.isNativePlatform();
}

export function runtimeUrl(path: string): string {
  if (!isNativeRuntime()) return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (!path.startsWith('/')) return path;
  return `${PRODUCTION_ORIGIN}${path}`;
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
