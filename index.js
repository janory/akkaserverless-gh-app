const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const clone = require('git-clone')
const cmd = require('./cmd')
const fs = require('fs')
const axios = require('axios').default;

const { resolve } = require('path');
const { readdir } = require('fs').promises;

const installations = new Map();

async function getFiles(dir) {
  const dirents = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(dirents.map((dirent) => {
    const res = resolve(dir, dirent.name);
    return dirent.isDirectory() ? getFiles(res) : res;
  }));
  return Array.prototype.concat(...files);
}

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())
 
app.get('/', function (req, res) {
  res.send('Hello World')
})
 
app.post('/callback', function (req, res) {
  console.log('================== callback start ==================')
  console.log('    ---- headers ----')
  console.log(req.headers) 
  console.log('    ---- body ----')
  console.log(JSON.stringify(req.body, null, 2))
  console.log('================== callback end ==================')
  res.sendStatus(200)
})

app.get('/register-project', async function (req, res) {
  console.log('================== register-project ==================')
  console.log('    ---- headers ----')
  console.log(req.headers) 
  console.log('    ---- query ----')
  console.log(req.query) 
  console.log('    ---- body ----')
  console.log(JSON.stringify(req.body, null, 2))
  console.log('================== register-project ==================')
  const projectId = req.query.state

  const instaId = parseInt(req.query.installation_id)

  const current = installations.get(instaId)

  console.log('current', current)

  installations.set(instaId, {...current, projectId})

    // const {repoFullName, repoName} = current

    console.log('installations', installations)

    const key = `{  "type": "service_account",  "project_id": "akkaserverless-workbench",  "private_key_id": ... }`

    // akkasls-dev docker add-credentials --docker-server https://gcr.io \\n  --docker-username _json_key \\n  --docker-email janos@lightbend.com \\n  --docker-password "$(cat keyfile.json)"
    cmd('akkasls', ['-H', 'api.akkaserverless.dev:443', '--context', 'dev', 'docker', 'add-credentials', '--docker-server', 'https://gcr.io', '--docker-username', '_json_key', '--docker-email', 'janos@lightbend.com', '--docker-password', key,'--project', projectId], (err) => {     
      res.redirect(301, `http://localhost:3001/p/github-hook?installation_id=${instaId}`)
    })
    // res.redirect(301, `http://localhost:3001/p/github-hook?installation_id=${instaId}`)

})

app.get('/deploy', async function (req, res) {
  console.log('================== deploy ==================')
  console.log('    ---- headers ----')
  console.log(req.headers) 
  console.log('    ---- query ----')
  console.log(req.query) 
  console.log('    ---- body ----')
  console.log(JSON.stringify(req.body, null, 2))
  console.log('================== deploy ==================')

  const instaId = parseInt(req.query.installation_id)

  const current = installations.get(instaId)

  console.log('current', current)

  const {repoName, repoFullName, projectId} = current


  //repos/{owner}/{repo}
  axios.get(`https://api.github.com/repos/${repoFullName}`)
  .then(function (response) {
      fs.rmdirSync(`/tmp/${repoName}`, { recursive: true });
      clone(response.data.clone_url, `/tmp/${repoName}`, [], async () => {
    console.log('checked out')
    const files = await getFiles(`/tmp/${repoName}`)
    const dfPath = files.find(name => name.endsWith('Dockerfile'))
    const dfPathAarr = dfPath.split('/')
    const dFiles = dfPathAarr.slice(0, dfPathAarr.length - 1).join('/')
    const tag = `gcr.io/akkaserverless-workbench/${repoFullName.replace('/', '-')}:${Date.now()}`
    console.log('tag', tag)
    cmd('docker', ['build', '-f', dfPath, '-t', tag, dFiles], (err) => { 
      cmd('docker', ['push', tag], (err) => { 
        // akkasls-dev service deploy chirper-function gcr.io/akkaserverless-workbench/janos-chirper-function:v8 --project 1874b0d5-6f1b-400b-89e4-05eda41b46d 
          cmd('akkasls', ['-H', 'api.akkaserverless.dev:443', '--context', 'dev', 'service', 'delete', `${repoFullName.replace('/', '-')}-service`, '--project', projectId], (err) => { 
            setTimeout(() =>
              cmd('akkasls', ['-H', 'api.akkaserverless.dev:443', '--context', 'dev', 'service', 'deploy', `${repoFullName.replace('/', '-')}-service`, tag, '--project', projectId], (err) => { 
                // akkasls-dev service expose
                cmd('akkasls', ['-H', 'api.akkaserverless.dev:443', '--context', 'dev', 'service', 'expose', `${repoFullName.replace('/', '-')}-service`, '--enable-cors', '--project', projectId], (err) => { 
                  res.sendStatus(200)
                })
              })
            ,1000)
        })
      })
    })
  })
  })
  .catch(function (error) {
    // handle error
    console.log(error);
  })

})
 
app.post('/webhook', async function (req, res) {
  console.log('================== webhook start ==================')
  console.log('    ---- headers ----')
  console.log(req.headers) 
  console.log('    ---- body ----')
  console.log(JSON.stringify(req.body, null, 2))
  console.log('================== webhook end ==================')

  const event = req.get('x-github-event')
  if (event === 'push') {
    const instaId = req.body.installation.id
    const current = installations.get(instaId)
    const projectId = current.projectId
    fs.rmdirSync(`/tmp/${req.body.repository.name}`, { recursive: true });
    clone(req.body.repository.clone_url, `/tmp/${req.body.repository.name}`, [], async () => {
      console.log('checked out')
      const files = await getFiles(`/tmp/${req.body.repository.name}`)
      const dfPath = files.find(name => name.endsWith('Dockerfile'))
      const dfPathAarr = dfPath.split('/')
      const dFiles = dfPathAarr.slice(0, dfPathAarr.length - 1).join('/')
      const tag = `gcr.io/akkaserverless-workbench/${req.body.repository.full_name.replace('/', '-')}:${Date.now()}`
      console.log('tag', tag)
      cmd('docker', ['build', '-f', dfPath, '-t', tag, dFiles], (err) => { 
        cmd('docker', ['push', tag], (err) => { 
          // akkasls-dev service deploy chirper-function gcr.io/akkaserverless-workbench/janos-chirper-function:v8 --project 1874b0d5-6f1b-400b-89e4-05eda41b46d 
          cmd('akkasls', ['-H', 'api.akkaserverless.dev:443', '--context', 'dev', 'service', 'delete', `${req.body.repository.full_name.replace('/', '-')}-service`, '--project', projectId], (err) => { 
            setTimeout(() =>
            cmd('akkasls', ['-H', 'api.akkaserverless.dev:443', '--context', 'dev', 'service', 'deploy', `${req.body.repository.full_name.replace('/', '-')}-service`, tag, '--project', projectId], (err) => { 
              // akkasls-dev service expose
              // cmd('akkasls', ['-H', 'api.akkaserverless.dev:443', '--context', 'dev', 'service', 'expose', `${req.body.repository.full_name.replace('/', '-')}-service`, '--enable-cors', '--project', projectId], (err) => { 
                res.sendStatus(200)
              // })
            })
            ,1000)
          })
        })
      })
    })
  } else if (event === 'installation' && req.body.action === 'created') {
    const instaId = req.body.installation.id
    const repoName = req.body.repositories[0].name
    const repoFullName = req.body.repositories[0].full_name

    const current = installations.get(instaId) || {}


    installations.set(instaId, {...current, ...{
        repoName,
        repoFullName
      }})

    res.sendStatus(200)
  }
})
 
 
app.listen(8080)