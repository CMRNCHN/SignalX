import { app, BrowserWindow } from 'electron'
import path from 'path'
import { initDb } from './db'
import { SignalClient } from './signal/client'
import { registerHandlers } from './ipc'
import { init as initNotifications } from './business/notifications'

let mainWindow: BrowserWindow | null = null
let signal: SignalClient | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,   // Never enable — keeps renderer sandboxed
      sandbox: false            // Needed for preload to access Node APIs
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

async function startSignal(): Promise<SignalClient> {
  const accountNumber = process.env.SIGNALX_NUMBER
  if (!accountNumber) throw new Error('SIGNALX_NUMBER environment variable is required')

  const signalCliBin = process.env.SIGNALX_SIGNALCLI_BIN ?? 'signal-cli'
  const client = new SignalClient(accountNumber, signalCliBin)

  client.on('daemon-log', (line: string) => console.log('[signal-cli]', line))
  client.on('daemon-exit', (code: number) => console.warn('[signal-cli] exited with code', code))
  client.on('error', (err: Error) => console.error('[signal]', err.message))

  await client.start()
  return client
}

app.whenReady().then(async () => {
  initDb()

  try {
    signal = await startSignal()
    initNotifications(signal)
  } catch (err) {
    // App is still usable for DB-only operations if Signal fails to start
    console.error('Signal daemon failed to start:', err)
  }

  mainWindow = createWindow()
  if (signal) registerHandlers(signal, mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('window-all-closed', async () => {
  await signal?.shutdown()
  if (process.platform !== 'darwin') app.quit()
})
