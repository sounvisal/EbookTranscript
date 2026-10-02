const git = require('isomorphic-git')
const fs = require('fs')

async function commit(message) {
  const dir = '.'
  await git.add({ fs, dir, filepath: 'app/api/transcribe/route.ts' })
  await git.add({ fs, dir, filepath: 'lib/telegram.ts' })
  
  const sha = await git.commit({
    fs,
    dir,
    message,
    author: {
      name: 'Signal AI',
      email: 'bot@signal.ai'
    }
  })
  console.log('Committed:', sha)
}

commit('fix(telemetry): await trackUsage in stream and use Math.max of transcripts/metrics in Daily Recap')
