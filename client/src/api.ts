// One place for the server address. Set VITE_API_URL in client/.env to point somewhere else.
export const API_BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiFetch(path: string, token: string | null, options: RequestInit = {}): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error('Could not connect to the server. Is it running?');
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // empty or non-JSON body
  }

  // An expired or rejected login token: tell the app so it can send the user back to the login page
  if (res.status === 401 && token) {
    window.dispatchEvent(new Event('auth:expired'));
  }

  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error;
    throw new Error(message || 'Request failed');
  }

  return data;
}
