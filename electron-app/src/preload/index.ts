// Preload: the only bridge between renderer and main.
// Expose exactly the surface defined in shared/types.ts — nothing more.
// The renderer never gets access to Node or Electron internals.

import { contextBridge, ipcRenderer } from 'electron'
import type { API, IncomingSignalMessage, SignalStatus } from '../shared/types'

const api: API = {
  customers: {
    create: (args) => ipcRenderer.invoke('customers:create', args),
    list: () => ipcRenderer.invoke('customers:list'),
    get: (id) => ipcRenderer.invoke('customers:get', id)
  },

  orders: {
    create: (args) => ipcRenderer.invoke('orders:create', args),
    list: () => ipcRenderer.invoke('orders:list'),
    get: (id) => ipcRenderer.invoke('orders:get', id),
    updateStatus: (id, status) => ipcRenderer.invoke('orders:updateStatus', id, status)
  },

  invoices: {
    create: (orderId) => ipcRenderer.invoke('invoices:create', orderId),
    list: () => ipcRenderer.invoke('invoices:list'),
    get: (id) => ipcRenderer.invoke('invoices:get', id),
    recordPayment: (id, amount) => ipcRenderer.invoke('invoices:recordPayment', id, amount)
  },

  signal: {
    send: (phone, customerId, message) =>
      ipcRenderer.invoke('signal:send', phone, customerId, message),
    getConversation: (customerId) =>
      ipcRenderer.invoke('signal:getConversation', customerId),
    sendOrderConfirmation: (customerId, orderId) =>
      ipcRenderer.invoke('signal:sendOrderConfirmation', customerId, orderId),
    sendInvoiceNotification: (customerId, invoiceId) =>
      ipcRenderer.invoke('signal:sendInvoiceNotification', customerId, invoiceId),
    sendPaymentReminder: (customerId, invoiceId) =>
      ipcRenderer.invoke('signal:sendPaymentReminder', customerId, invoiceId)
  },

  ai: {
    summarize: (messages) => ipcRenderer.invoke('ai:summarize', messages),
    generateDraft: (args) => ipcRenderer.invoke('ai:generateDraft', args)
  },

  // Event subscriptions return an unsubscribe function — callers own cleanup
  on: {
    signalMessage: (handler: (msg: IncomingSignalMessage) => void) => {
      const listener = (_: Electron.IpcRendererEvent, msg: IncomingSignalMessage) => handler(msg)
      ipcRenderer.on('signal:message', listener)
      return () => ipcRenderer.removeListener('signal:message', listener)
    },
    signalStatus: (handler: (status: SignalStatus) => void) => {
      const listener = (_: Electron.IpcRendererEvent, s: SignalStatus) => handler(s)
      ipcRenderer.on('signal:status', listener)
      return () => ipcRenderer.removeListener('signal:status', listener)
    },
    aiToken: (handler) => {
      const listener = (_: Electron.IpcRendererEvent, args: { requestId: string; token: string; done: boolean }) =>
        handler(args)
      ipcRenderer.on('ai:token', listener)
      return () => ipcRenderer.removeListener('ai:token', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
