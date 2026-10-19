const API_BASE = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let isRefreshing = false;
let refreshSubscribers: ((tokenRefreshed: boolean) => void)[] = [];

function onRefreshed(success: boolean) {
  for (const cb of refreshSubscribers) {
    cb(success);
  }
  refreshSubscribers = [];
}

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const headers = new Headers(options.headers);

  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Envia e recebe cookies HttpOnly de sessão
  });

  if (
    response.status === 401 &&
    !endpoint.includes('/auth/login') &&
    !endpoint.includes('/auth/refresh')
  ) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshRes = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        isRefreshing = false;
        if (refreshRes.ok) {
          onRefreshed(true);
          return apiRequest<T>(endpoint, options);
        }
        onRefreshed(false);
      } catch {
        isRefreshing = false;
        onRefreshed(false);
      }
    } else {
      return new Promise<T>((resolve, reject) => {
        refreshSubscribers.push((success) => {
          if (success) {
            resolve(apiRequest<T>(endpoint, options));
          } else {
            reject(new ApiError(401, 'UNAUTHORIZED', 'Sessão expirada'));
          }
        });
      });
    }
  }

  if (!response.ok) {
    let errorData: { error?: { code?: string; message?: string; details?: unknown } } = {};
    try {
      errorData = await response.json();
    } catch {
      // Ignora erro de parse de JSON se corpo não for JSON
    }

    throw new ApiError(
      response.status,
      errorData.error?.code || 'API_ERROR',
      errorData.error?.message || `Erro ${response.status}: ${response.statusText}`,
      errorData.error?.details
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  get: <T>(endpoint: string) => apiRequest<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, body?: unknown) =>
    apiRequest<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: <T>(endpoint: string, body?: unknown) =>
    apiRequest<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(endpoint: string, body?: unknown) =>
    apiRequest<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(endpoint: string) => apiRequest<T>(endpoint, { method: 'DELETE' }),
};
