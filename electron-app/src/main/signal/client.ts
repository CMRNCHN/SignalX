import { EventEmitter } from 'events'
import net from 'net'
import { spawn, ChildProcess } from 'child_process'
import os from 'os'
import path from 'path'
import fs from 'fs'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  method: string
  params: Record<string, unknown>
  id: number
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id?: number
  result?: unknown
  error?: { code: number; message: string }
  method?: string
  params?: unknown
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

export interface SignalMessage {
  source: string
  sourceNumber: string
  content: string
  timestamp: number
}

const CALL_TIMEOUT_MS = 15_000
const MAX_BACKOFF_MS = 30_000
const SOCKET_READY_POLL_INTERVAL_MS = 200
const SOCKET_READY_MAX_WAIT_MS = 10_000

export class SignalClient extends EventEmitter {
  private socket: net.Socket | null = null
  private buffer = ''
  private pending = new Map<number, Pending>()
  private nextId = 1
  private reconnectAttempts = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private daemonProcess: ChildProcess | null = null
  private isShuttingDown = false
  readonly socketPath: string

  constructor(
    private readonly accountNumber: string,
    private readonly signalCliBin: string = 'signal-cli',
    socketDir: string = os.tmpdir()
  ) {
    super()
    // Stable socket path per account — survives restarts
    const safe = accountNumber.replace(/[^a-z0-9]/gi, '_')
    this.socketPath = path.join(socketDir, `signalx-${safe}.sock`)
  }

  // Public entry point. Call once at app startup.
  async start(): Promise<void> {
    // Clean up a stale socket file so we can bind a fresh one
    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath)
    }
    await this.spawnDaemon()
    await this.waitForSocket()
    await this.connect()
  }

  private spawnDaemon(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.daemonProcess = spawn(
        this.signalCliBin,
        ['-u', this.accountNumber, '--output=json', 'daemon', '--socket', this.socketPath],
        { stdio: ['ignore', 'ignore', 'pipe'] }
      )

      this.daemonProcess.stderr?.on('data', (d: Buffer) => {
        const line = d.toString().trim()
        if (line) this.emit('daemon-log', line)
      })

      this.daemonProcess.on('error', reject)

      this.daemonProcess.on('exit', (code) => {
        if (!this.isShuttingDown) {
          this.emit('daemon-exit', code)
          this.scheduleReconnect()
        }
      })

      // Resolve once spawn succeeds — socket readiness is checked separately
      resolve()
    })
  }

  private waitForSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now()
      const poll = () => {
        if (fs.existsSync(this.socketPath)) {
          resolve()
          return
        }
        if (Date.now() - start > SOCKET_READY_MAX_WAIT_MS) {
          reject(new Error(`signal-cli socket not ready after ${SOCKET_READY_MAX_WAIT_MS}ms`))
          return
        }
        setTimeout(poll, SOCKET_READY_POLL_INTERVAL_MS)
      }
      poll()
    })
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.socketPath)

      socket.once('connect', () => {
        this.socket = socket
        this.reconnectAttempts = 0
        this.emit('status', 'connected')
        resolve()
      })

      socket.once('error', (err) => {
        // Only reject on the initial connect; after that, errors go to scheduleReconnect
        socket.destroy()
        reject(err)
      })

      socket.on('data', (data) => this.onData(data))
      socket.on('close', () => this.onClose())

      // Re-emit socket errors after initial connect as general errors
      socket.on('error', (err) => {
        if (this.socket) this.emit('error', err)
      })
    })
  }

  private onData(data: Buffer): void {
    this.buffer += data.toString('utf8')
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        this.dispatch(JSON.parse(trimmed) as JsonRpcResponse)
      } catch {
        // Skip malformed lines — signal-cli occasionally emits debug text
      }
    }
  }

  private dispatch(msg: JsonRpcResponse): void {
    // Response to a pending call
    if (msg.id !== undefined) {
      const pending = this.pending.get(msg.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(msg.id)
      if (msg.error) {
        pending.reject(new Error(msg.error.message))
      } else {
        pending.resolve(msg.result)
      }
      return
    }

    // Unsolicited notification (incoming message)
    if (msg.method === 'receive') {
      this.handleIncoming(msg.params as Record<string, unknown>)
    }
  }

  private handleIncoming(params: Record<string, unknown>): void {
    const envelope = params.envelope as Record<string, unknown> | undefined
    if (!envelope) return
    const data = envelope.dataMessage as Record<string, unknown> | undefined
    if (!data?.message) return

    this.emit('message', {
      source: envelope.source as string ?? '',
      sourceNumber: envelope.sourceNumber as string ?? '',
      content: data.message as string,
      timestamp: envelope.timestamp as number ?? Date.now()
    } satisfies SignalMessage)
  }

  private onClose(): void {
    this.socket = null
    if (!this.isShuttingDown) {
      this.emit('status', 'reconnecting')
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isShuttingDown) return
    const delay = Math.min(500 * 2 ** this.reconnectAttempts, MAX_BACKOFF_MS)
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      try {
        await this.connect()
      } catch {
        this.scheduleReconnect()
      }
    }, delay)
  }

  private call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Signal daemon not connected'))
        return
      }

      const id = this.nextId++
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Signal call '${method}' timed out after ${CALL_TIMEOUT_MS}ms`))
      }, CALL_TIMEOUT_MS)

      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })

      const req: JsonRpcRequest = { jsonrpc: '2.0', method, params, id }
      this.socket.write(JSON.stringify(req) + '\n')
    })
  }

  async sendMessage(recipient: string, message: string): Promise<void> {
    await this.call<unknown>('send', { recipient: [recipient], message })
  }

  onMessage(handler: (msg: SignalMessage) => void): void {
    this.on('message', handler)
  }

  onStatus(handler: (status: string) => void): void {
    this.on('status', handler)
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    // Reject all pending calls cleanly
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error('SignalClient shut down'))
    }
    this.pending.clear()
    this.socket?.destroy()
    this.socket = null
    this.daemonProcess?.kill()
    this.daemonProcess = null
  }
}
