require('dotenv').config({path: '../.env', silent: true})

const path = require('path')
const express = require('express')
const compression = require('compression')
const serveStatic = require('serve-static')
const k8s = require('k8s')

const namespacesRoute = require('./routes/namespaces')
const modifyOnWatch = require('./modify-on-watch')

const {
  KUBERNETES_ENDPOINT,
  KUBERNETES_TOKEN,
  NAMESPACE
} = process.env
const kubeApi = k8s.api({
  auth: {
    token: KUBERNETES_TOKEN
  },
  endpoint: KUBERNETES_ENDPOINT,
  strictSSL: false,
  version: '/api/v1'
})
const app = express()

require('express-ws')(app)

app.use(compression())

// actual code

const websockets = []
const namespaces = []
const deployments = []
const pods = []

app.use('/bundle.js', serveStatic(path.join(__dirname, '../', 'client/dist/bundle.js')))
app.ws('/namespaces', (ws) => {
  namespacesRoute(websockets, ws, namespaces, deployments, pods)
})
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../', 'client/dist/index.html'))
})

const modifyNamespaces = modifyOnWatch(namespaces)
const modifyDeployments = modifyOnWatch(deployments)
const modifyPods = modifyOnWatch(pods)
const openConnections = {
  namespaces: false,
  deployments: false,
  pods: false
}
const typeMap = {
  Namespace: 'namespace',
  Pod: 'pod',
  ReplicationController: 'deployment'
}

const watchTimeout = 90000
const onWatchSuccess = (modifyFn, connectionName) => {
  return (data) => {
    data = Object.assign(data, {nodeType: typeMap[data.object.kind]})
    openConnections[connectionName] = true
    modifyFn(data, websockets, namespaces, deployments, pods)
  }
}
const onWatchError = (connectionName, connect) => {
  return () => {
    // console.log(connectionName, 'closed; reconnecting')

    connect()
  }
}

const namespacesEndpoint = `watch/namespaces${NAMESPACE ? '/' + NAMESPACE : ''}`
const deploymentsEndpoint = NAMESPACE
  ? `watch/namespaces/${NAMESPACE}/replicationcontrollers`
  : 'watch/replicationcontrollers'
const podsEndpoint = NAMESPACE
  ? `watch/namespaces/${NAMESPACE}/pods`
  : 'watch/pods'

const connectNamespaces = () => {
  kubeApi.watch(
    namespacesEndpoint,
    onWatchSuccess(modifyNamespaces, 'namespaces'),
    onWatchError('namespaces', connectNamespaces),
    watchTimeout
  )
}

const connectDeployments = () => {
  kubeApi.watch(
    deploymentsEndpoint,
    onWatchSuccess(modifyDeployments, 'deployments'),
    onWatchError('deployments', connectDeployments),
    watchTimeout
  )
}

const connectPods = () => {
  kubeApi.watch(
    podsEndpoint,
    onWatchSuccess(modifyPods, 'pods'),
    onWatchError('pods', connectPods),
    watchTimeout
  )
}

connectNamespaces()
connectDeployments()
connectPods()

app.listen(3000, () => {
  console.log('app listening on port 3000')
})