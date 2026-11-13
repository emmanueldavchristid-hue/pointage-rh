import { toQuery, uuid } from './utils';
import type { ApiErrorBody } from './types';

const API_BASE = '/api';
const DEVICE_KEY = 'pointage-rh.device-id';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Issues zod (422 VALIDATION_ERROR) → { champ: message } pour RHF setError. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const issue of this.details as { path?: (string | number)[]; message?: string }[]) {
        const key = issue.path?.join('.');
        if (key && issue.message && !out[key]) out[key] = issue.message;
      }
    }
    return out;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** Message lisible pour n'importe quelle erreur (à passer à toast.error). */
export function errorMessage(e: unknown, fallback = 'Une erreur inattendue est survenue.'): string {
  if (e instanceof ApiError) return e.message || fallback;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'unknown-device';
  }
}

// ---- Gestion centralisée du 401 -------------------------------------------
type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/** L'AuthProvider s'y abonne pour vider la session et rediriger vers /login. */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) {
  unauthorizedHandler = fn;
}

const NO_REDIRECT_PATHS = ['/auth/me', '/auth/login', '/auth/logout'];

function handleUnauthorized(path: string) {
  if (NO_REDIRECT_PATHS.some((p) => path.startsWith(p))) return;
  if (path.startsWith('/kiosk/')) return;
  if (unauthorizedHandler) unauthorizedHandler();
  else if (!window.location.pathname.startsWith('/login')) window.location.assign('/login');
}

// ---- Requêtes ---------------------------------------------------------------
export type QueryParams = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Objet sérialisé en JSON, ou FormData (multipart). */
  body?: unknown;
  params?: QueryParams;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function rawRequest(path: string, opts: RequestOptions = {}): Promise<Response> {
  const { method = 'GET', body, params, headers = {}, signal } = opts;
  const init: RequestInit = {
    method,
    credentials: 'include',
    signal,
    headers: { Accept: 'application/json', 'X-Device-Id': getDeviceId(), ...headers },
  };
  if (body !== undefined) {
    if (body instanceof FormData) {
      init.body = body;
    } else {
      (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${toQuery(params)}`, init);
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', 'Impossible de joindre le serveur. Vérifiez votre connexion au réseau.');
  }

  if (!res.ok) {
    let parsed: ApiErrorBody | null = null;
    try {
      parsed = (await res.json()) as ApiErrorBody;
    } catch {
      /* corps non JSON */
    }
    // Réponse 5xx sans corps JSON = proxy (Vite/Nginx) qui n'atteint pas le backend.
    if (!parsed?.error && [500, 502, 503, 504].includes(res.status)) {
      throw new ApiError(0, 'NETWORK_ERROR', 'Le serveur est momentanément indisponible. Réessayez dans un instant.');
    }
    const code = parsed?.error?.code ?? defaultCode(res.status);
    const message = parsed?.error?.message ?? defaultMessage(res.status);
    if (res.status === 401) handleUnauthorized(path);
    throw new ApiError(res.status, code, message, parsed?.error?.details);
  }
  return res;
}

function defaultCode(status: number): string {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 423) return 'ACCOUNT_LOCKED';
  return status >= 500 ? 'SERVER_ERROR' : 'HTTP_ERROR';
}

function defaultMessage(status: number): string {
  if (status === 401) return 'Votre session a expiré. Veuillez vous reconnecter.';
  if (status === 403) return "Vous n'avez pas les droits nécessaires pour cette action.";
  if (status === 404) return 'Ressource introuvable.';
  if (status === 423) return 'Compte temporairement verrouillé.';
  if (status >= 500) return 'Le serveur a rencontré une erreur. Réessayez dans un instant.';
  return 'La requête a échoué.';
}

export async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await rawRequest(path, opts);
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

export const api = {
  get: <T>(path: string, params?: QueryParams, signal?: AbortSignal) =>
    request<T>(path, { params, signal }),
  post: <T>(path: string, body?: unknown, params?: QueryParams) =>
    request<T>(path, { method: 'POST', body: body ?? {}, params }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: body ?? {} }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** Envoi multipart : `api.upload('/employees/1/photo', { file })`. */
  upload: <T>(path: string, fields: Record<string, string | Blob | number | boolean | null | undefined>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null) continue;
      fd.append(k, v instanceof Blob ? v : String(v));
    }
    return request<T>(path, { method: 'POST', body: fd });
  },
};

/** Télécharge un fichier binaire (xlsx/pdf/csv) et déclenche l'enregistrement navigateur. */
export async function downloadFile(path: string, params?: QueryParams, fallbackName = 'export'): Promise<void> {
  const res = await rawRequest(path, { params, headers: { Accept: '*/*' } });
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** URL absolue d'un fichier servi par le backend (photos, logos). */
export function assetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return path.startsWith('/') ? path : `/${path}`;
}
