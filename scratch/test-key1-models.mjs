import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const multiMatch = envFile.match(/GEMINI_API_KEYS=([^\r\n]+)/)
const keys = multiMatch ? multiMatch[1].split(',').map(k => k.trim()) : []
const key1 = keys[1]

const models = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-pro']

for (const m of models) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key1}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Hi' }] }]
    })
  })
  console.log(`Model ${m}: status ${res.status}`)
  const text = await res.text()
  if (!res.ok) console.log(text)
  else console.log('OK!')
}
