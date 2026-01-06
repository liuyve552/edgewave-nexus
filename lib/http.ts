export class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(`Invalid JSON response (status ${res.status})`, res.status);
  }
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<{ data: T; status: number }> {
  const res = await fetch(url, init);
  if (!res.ok) throw new HttpError(`Request failed: ${res.status}`, res.status);
  return { data: await readJson<T>(res), status: res.status };
}

