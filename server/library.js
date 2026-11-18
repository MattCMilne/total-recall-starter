// Library search: shows what your agent's memory knows, with links to the original sources.
// This app does NOT build a second library. It asks the memory service you already run
// (the one your Hermes uses) through ONE adapter function below.
//
// Set MEMORY_SEARCH_URL (and MEMORY_SEARCH_KEY if it needs one). The default adapter sends
//   POST MEMORY_SEARCH_URL  {"query": "...", "limit": 10}
// and accepts results shaped like [{title, snippet|text|content, url|source_url, date|created_at}]
// either as a bare array or under "results" / "items". If your service differs, change toResults() only.

export function libraryStatus() {
  return process.env.MEMORY_SEARCH_URL
    ? { state: 'connected', detail: 'Searching your memory service.' }
    : { state: 'not_connected', detail: 'Set MEMORY_SEARCH_URL to search your library here.' };
}

function toResults(json) {
  const list = Array.isArray(json) ? json : json?.results || json?.items || json?.data || [];
  return list.slice(0, 20).map((r) => ({
    title: String(r.title || r.name || r.source || 'Untitled').slice(0, 200),
    snippet: String(r.snippet || r.text || r.content || r.chunk || '').slice(0, 600),
    url: typeof (r.url || r.source_url || r.link) === 'string' ? (r.url || r.source_url || r.link) : null,
    date: r.date || r.created_at || r.source_date || null,
  }));
}

export async function searchLibrary(query) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(process.env.MEMORY_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.MEMORY_SEARCH_KEY ? { Authorization: `Bearer ${process.env.MEMORY_SEARCH_KEY}` } : {}),
      },
      body: JSON.stringify({ query, limit: 10 }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw Object.assign(new Error(`Memory service answered HTTP ${res.status}.`), { status: 502 });
    return toResults(await res.json());
  } finally {
    clearTimeout(timer);
  }
}
