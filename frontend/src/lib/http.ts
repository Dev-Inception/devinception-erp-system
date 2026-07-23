/**
 * Real backend HTTP client (axios).
 *
 * This is the single axios instance every integrated module talks to. It:
 *  - points at the backend (`VITE_API_URL`, default http://localhost:5050/api),
 *  - sends the bearer access token on every request,
 *  - unwraps the backend's `{ success, message, data }` envelope so callers read
 *    `res.data` as the raw payload (matching the old mock surface),
 *  - on a 401, transparently refreshes the access token once (single-flight) using
 *    the httpOnly refresh cookie and retries the original request; if that fails it
 *    triggers logout.
 *
 * Auth wiring (token getter / refresh / logout) is injected via `configureAuth`
 * from the auth store to avoid a circular import.
 */
import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

// Allow callers to opt a request out of the 401 refresh-and-retry flow
// (used by the auth endpoints themselves).
declare module 'axios' {
  export interface AxiosRequestConfig {
    skipAuthRefresh?: boolean;
  }
}

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5050/api';

export const http = axios.create({ baseURL, withCredentials: true });

/* ── auth hooks injected by the auth store ── */
let getToken: () => string | null = () => null;
let refreshToken: () => Promise<string | null> = async () => null;
let onAuthFailure: () => void = () => {};

export function configureAuth(opts: {
  getToken: () => string | null;
  refreshToken: () => Promise<string | null>;
  onAuthFailure: () => void;
}) {
  getToken = opts.getToken;
  refreshToken = opts.refreshToken;
  onAuthFailure = opts.onAuthFailure;
}

/* Per-request flags we set internally (not part of axios' public types). */
type RetryConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

/* ── request: attach bearer token ── */
http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/* ── response: unwrap envelope + 401 refresh/retry ── */
let refreshing: Promise<string | null> | null = null;

function unwrap(res: AxiosResponse): AxiosResponse {
  // Leave binary responses (e.g. PDF blobs) untouched.
  if (res.config.responseType === 'blob' || res.config.responseType === 'arraybuffer') {
    return res;
  }
  const body = res.data;
  if (body && typeof body === 'object' && 'success' in body) {
    // `{ success, message, data }` → payload; `{ success, message }` → the body itself.
    res.data = 'data' in body ? body.data : body;
  }
  return res;
}

http.interceptors.response.use(unwrap, async (error: AxiosError) => {
  const config = error.config as RetryConfig | undefined;
  const status = error.response?.status;

  if (status === 401 && config && !config._retry && !config.skipAuthRefresh) {
    config._retry = true;
    try {
      // Single-flight: concurrent 401s share one refresh call.
      refreshing = refreshing ?? refreshToken();
      const token = await refreshing;
      refreshing = null;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        return http(config);
      }
    } catch {
      refreshing = null;
    }
    onAuthFailure();
  }

  return Promise.reject(error);
});
