import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isIPv4 } from 'node:net'
import path from 'node:path'
import network from '../model/Network.js'

/** Publica as sub-redes para a descoberta feita pelo navegador. */
function configureLocalNetwork(server) {
  network.obtainCidrs()
  const { cidrs } = network
  mkdirSync(server.config.publicDir, { recursive: true })
  writeFileSync(
    path.join(server.config.publicDir, 'local-network.json'),
    `${JSON.stringify({ cidrs }, null, 2)}\n`,
  )
  console.log(
    cidrs.length > 0
      ? `Sub-redes locais: ${cidrs.join(', ')}`
      : 'Nenhuma sub-rede IPv4 local encontrada.',
  )
}

/**
 * Recebe cada descoberta da GUI e acrescenta sua URL ao CSV, sem duplicatas.
 * @param {import('vite').ViteDevServer | import('vite').PreviewServer} server - Servidor local da GUI.
 */
function configurePeers(server) {
  const peersFile = path.resolve(server.config.root, 'api/peers.csv')
  server.middlewares.use((request, response, next) => {
    const requestUrl = new URL(request.url, 'http://localhost')
    if (requestUrl.pathname !== '/api/peers.csv' || request.method !== 'POST') return next()

    let peer
    try {
      if (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host) {
        response.writeHead(403).end()
        return
      }
      peer = new URL(requestUrl.searchParams.get('url'))
      if (peer.protocol !== 'http:' || !isIPv4(peer.hostname) || peer.href !== `${peer.origin}/`) {
        response.writeHead(400).end('URL inválida.')
        return
      }
    } catch {
      response.writeHead(400).end('URL inválida.')
      return
    }

    try {
      const csv = readFileSync(peersFile, 'utf8')
      if (!csv.split(/\r?\n/).includes(peer.origin)) {
        appendFileSync(peersFile, `${csv.endsWith('\n') ? '' : '\n'}${peer.origin}\n`)
      }
      response.writeHead(204).end()
    } catch {
      response.writeHead(500).end('Não foi possível salvar em peers.csv.')
    }
  })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: 'local-network',
    configureServer: configureLocalNetwork,
  }, {
    name: 'peers-csv',
    configureServer: configurePeers,
    configurePreviewServer: configurePeers,
  }],
})
