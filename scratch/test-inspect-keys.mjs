import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const multi = (envFile.match(/GEMINI_API_KEYS=([^\r\n]+)/) || [])[1] || ''
const keys = multi.split(',').map(k => k.trim())

console.log('Number of keys in GEMINI_API_KEYS:', keys.length)
keys.forEach((k, i) => {
  console.log(`Key ${i}: length=${k.length}, prefix=${k.slice(0, 10)}, suffix=${k.slice(-6)}`)
})

const single = (envFile.match(/GEMINI_API_KEY=([^\r\n]+)/) || [])[1] || ''
console.log(`Single GEMINI_API_KEY: length=${single.length}, prefix=${single.slice(0, 10)}, suffix=${single.slice(-6)}`)
