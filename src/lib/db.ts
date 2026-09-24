import type { Series } from '@/types';

export interface ApiError {
  message: string;
}

export type ApiResult<T> = { data: T; error: null } | { data: null; error: ApiError };

type RequestInitShape = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
};

async function request<T>(path: string, init?: RequestInitShape): Promise<ApiResult<T>> {
  try {
    const hasBody = init?.body !== undefined;
    const res = await fetch(`/api${path}`, {
      method: init?.method ?? 'GET',
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(init.body) : undefined,
    });

    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      const raw = parsed as { error?: unknown } | null;
      const message =
        raw && typeof raw.error === 'string'
          ? raw.error
          : `Request failed (${res.status})`;
      return { data: null, error: { message } };
    }

    const unwrapped = (parsed as { data?: T } | null)?.data;
    return { data: (unwrapped === undefined ? (parsed as T) : unwrapped) as T, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Network error' },
    };
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export type { Series };