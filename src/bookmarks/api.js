const base = '/api/account/bookmarks';

async function request(path = '', options) {
  const response = await fetch(base + path, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Saved moments are unavailable. Please retry.');
  return data;
}

export async function loadBookmarks(filter, signal) {
  const query = new URLSearchParams(filter).toString();
  return (await request(query ? '?' + query : '', { signal })).bookmarks;
}

export async function loadBookmark(id, signal) {
  return (await request('/' + encodeURIComponent(id), { signal })).moment;
}

export function setBookmark({ courseId, lectureId, runId, momentId }, saved) {
  return request('', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ courseId, lectureId, runId, momentId, saved }),
  });
}
