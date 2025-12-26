import { startUI } from './ui.js';
const baseUrl = process.env.SIGNALX_API ?? 'http://127.0.0.1:48484';
startUI({ baseUrl });
