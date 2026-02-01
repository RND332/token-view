import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { Readable } from 'node:stream'
import handlerModule from './dist/server/server.js'

const port = process.env.PORT || 4173
const clientDir = resolve('dist/client')

const handlerObj = handlerModule?.default ?? handlerModule
const handlerFetch = typeof handlerObj?.fetch === 'function' ? handlerObj.fetch.bind(handlerObj) : typeof handlerObj === 'function' ? handlerObj : null

if (typeof handlerFetch !== 'function') {
  console.error('Invalid server handler: missing fetch()')
  process.exit(1)
}

const staticFiles = new Set([
  'favicon.ico',
  'manifest.json',
  'robots.txt',
  'logo192.png',
  'logo512.png',
  'tanstack-circle-logo.png',
  'tanstack-word-logo-white.svg',
])

const mimeMap = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

    const staticPath = await resolveStatic(url.pathname)
    if (staticPath) {
      res.statusCode = 200
      res.setHeader('Content-Type', mimeMap[extname(staticPath)] ?? 'application/octet-stream')
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      createReadStream(staticPath)
        .on('error', (err) => handleError(err, res))
        .pipe(res)
      return
    }

    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Readable.toWeb(req)
    const request = new Request(url.toString(), {
      method: req.method,
      headers: req.headers,
      body,
    })

    const response = await handler.fetch(request)
    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))

    if (!response.body) {
      res.end()
      return
    }

    await Readable.fromWeb(response.body).pipe(res)
  } catch (error) {
    handleError(error, res)
  }
}).listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
})

async function resolveStatic(pathname) {
  if (pathname.startsWith('/assets/')) {
    return safeJoin(clientDir, pathname)
  }

  const trimmed = pathname.replace(/^\//, '')
  if (staticFiles.has(trimmed)) {
    return safeJoin(clientDir, pathname)
  }

  return null
}

async function safeJoin(root, pathname) {
  const normalized = normalize(pathname).replace(/^\/+/, '')
  const fsPath = join(root, normalized)

  try {
    const fileStat = await stat(fsPath)
    if (fileStat.isFile()) return fsPath
  } catch {
    return null
  }

  return null
}

function handleError(error, res) {
  console.error(error)
  if (!res.headersSent) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/plain')
  }
  res.end('Internal Server Error')
}
