const realFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input.href)
  if (url.hostname === 'api.telegram.org') return Response.json({ ok: true, result: { message_id: 123 } })
  if (url.hostname !== 'generativelanguage.googleapis.com') return realFetch(input, init)
  const headers = new Headers(init?.headers)
  if (url.pathname === '/upload/v1beta/files') {
    if (headers.get('x-goog-upload-command') === 'start') {
      const { file } = JSON.parse(init.body)
      const args = new URLSearchParams({ fileName: file.name, mimeType: file.mimeType })
      return new Response(null, { headers: { 'x-goog-upload-url': url.origin + url.pathname + '?' + args } })
    }
    const name = url.searchParams.get('fileName')
    return Response.json({ file: { name, uri: url.origin + '/v1beta/' + name, mimeType: url.searchParams.get('mimeType') } })
  }
  if (url.pathname.startsWith('/v1beta/files/')) {
    if (init?.method === 'DELETE') return new Response(null, { status: 204 })
    return Response.json({ name: url.pathname.slice(8), uri: url.href, mimeType: 'audio/mpeg', state: 'ACTIVE' })
  }
  if (url.pathname.endsWith(':streamGenerateContent')) {
    const result = { language: 'english', segments: [
      { start: 0, end: 2, text: 'A short example recording for the application test.' },
      { start: 2, end: 4, text: 'This verifies the complete job and saved transcript.' }
    ] }
    return new Response('data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] }) + '\n\n', {
      headers: { 'content-type': 'text/event-stream' }
    })
  }
  if (url.pathname.endsWith(':generateContent')) {
    return Response.json({ candidates: [{ content: { parts: [{ text: 'Synthetic summary for the report test.' }] } }] })
  }
  throw new Error('Unrecognized mock provider request.')
}

