export async function api(path, body) {
  const headers = { 'X-CleanTV-Token': document.querySelector('meta[name="cleantv-token"]').content };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(`/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch { throw Object.assign(new Error(), { code: 'DEVICE_UNREACHABLE' }); }
  const data = await response.json();
  if (data.error || !response.ok) throw Object.assign(new Error(data.error?.message), { code: data.error?.code ?? 'INTERNAL' });
  return data;
}
export function jobEvents(id, { progress, complete, error }) {
  const source = new EventSource(`/api/jobs/${encodeURIComponent(id)}/events`);
  source.addEventListener('progress', event => {
    try { progress(JSON.parse(event.data)); }
    catch { source.close(); error({ code: 'INTERNAL' }); }
  });
  source.addEventListener('complete', event => {
    source.close();
    try { complete(JSON.parse(event.data)); }
    catch { error({ code: 'INTERNAL' }); }
  });
  source.addEventListener('error', event => {
    source.close();
    let detail = { code: 'JOB_CONNECTION_LOST' };
    try { if (event.data) detail = JSON.parse(event.data); } catch { detail = { code: 'INTERNAL' }; }
    error(detail);
  });
  return source;
}
