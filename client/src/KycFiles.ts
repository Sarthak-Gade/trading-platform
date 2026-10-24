import { API_BASE } from './api';

// Opens a stored KYC document in a new tab. The file routes need the login token, so the file is
// fetched as a blob and shown from a temporary local address instead of a plain link.
export async function openDocument(path: string, token: string | null): Promise<void> {
  // The tab is opened first, while the click is still fresh, so the pop-up blocker allows it
  const tab = window.open('', '_blank');
  if (!tab) throw new Error('Allow pop-ups for this site to view the document');

  try {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token ?? ''}` } });
    } catch {
      throw new Error('Could not connect to the server. Is it running?');
    }
    if (!res.ok) {
      if (res.status === 401) window.dispatchEvent(new Event('auth:expired'));
      let message = 'Could not open the document';
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // not JSON
      }
      throw new Error(message);
    }
    const url = URL.createObjectURL(await res.blob());
    tab.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  } catch (err) {
    tab.close();
    throw err;
  }
}