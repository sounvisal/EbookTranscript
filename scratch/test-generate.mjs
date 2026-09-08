import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const multi = (envFile.match(/GEMINI_API_KEYS=([^\r\n]+)/) || [])[1] || ''
const keys = multi.split(',').map(k => k.trim().replace(/["'\r\n]/g, '')).filter(Boolean)

console.log(`Testing generateContent with ${keys.length} keys...`)

for (let i = 0; i < keys.length; i++) {
  const key = keys[i]
  console.log(`\nTesting Key #${i} (${key.slice(0, 8)}...)...`)
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hello, reply with OK' }] }]
      })
    })

    console.log(`Key #${i} generateContent status: ${res.status}`)
    const text = await res.text()
    if (res.ok) {
      console.log(`✅ Key #${i} OK:`, text.slice(0, 100))
    } else {
      console.error(`❌ Key #${i} Error:`, text)
    }
  } catch (e) {
    console.error(`❌ Key #${i} Exception:`, e.message)
  }
}
