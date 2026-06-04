export async function uploadWorkbook(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/extract', { method: 'POST', body: form })
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail ?? detail } catch (_) {}
    throw new Error(detail)
  }
  return res.json()
}

export async function loadDevData() {
  const res = await fetch('/api/dev-data')
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail ?? detail } catch (_) {}
    throw new Error(detail)
  }
  return res.json()
}
