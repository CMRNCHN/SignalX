type Level = 'debug'|'info'|'warn'|'error';
type Event = { ts:number; level:Level; scope:string; msg:string; meta?:any };

const KEY='signalx.logs.v1';
const MAX=2000;

function redact(meta:any){
  if(!meta) return meta;
  const s = JSON.stringify(meta);
  return s.replace(/\+?1\d{10}/g,'[redacted-number]');
}

export function log(level:Level, scope:string, msg:string, meta?:any){
  const ev:Event={ts:Date.now(), level, scope, msg, meta: meta? JSON.parse(redact(meta)) : undefined};
  const list = loadLogs();
  list.push(ev);
  while(list.length>MAX) list.shift();
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function loadLogs():Event[]{
  try { return JSON.parse(localStorage.getItem(KEY)||'[]'); } catch { return []; }
}
