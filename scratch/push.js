const git = require('isomorphic-git')
const http = require('isomorphic-git/http/node')
const fs = require('fs')

async function pushToGitHub(token) {
  try {
    const pushResult = await git.push({
      fs,
      http,
      dir: '.',
      remote: 'origin',
      ref: await git.currentBranch({ fs, dir: '.' }) || 'master',
      force: false,
      onAuth: () => ({
        username: token || process.env.GITHUB_TOKEN || '',
        password: ''
      })
    })
    console.log('Push result:', pushResult)
  } catch (err) {
    console.error('Push error:', err.message)
  }
}

if (process.argv[2]) {
  pushToGitHub(process.argv[2])
} else {
  console.log('Provide GitHub Token to push: node scratch/push.js <GITHUB_PERSONAL_ACCESS_TOKEN>')
}
