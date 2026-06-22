// Token-aware fetch for mutating engine endpoints. When the server runs with
// API_TOKEN set, the user stores the same token here (Navigation field) and it
// is sent as X-API-Key. Reads work without a token; mutations 401 without it.

const TOKEN_KEY = 'apiToken';

export function getApiToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setApiToken(token: string): void {
  try {
    if (token.trim()) localStorage.setItem(TOKEN_KEY, token.trim());
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* localStorage unavailable — ignore */
  }
}

export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getApiToken();
  const headers = new Headers(init.headers);
  if (token && !headers.has('X-API-Key')) headers.set('X-API-Key', token);
  return fetch(input, { ...init, headers });
}
