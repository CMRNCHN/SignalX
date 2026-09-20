// pricefmt-signal.js — Scriptable for Signal invoices
// Optimized for Signal's 28-character monospace width
// Width-perfect plain-text invoices/receipts for Signal messages.
// iPadOS 17+.

// INPUT: Shortcut parameter (text or dictionary), Shortcut "Texts", or clipboard.
//
// Directives (anywhere); sections switch with [brackets]:
//   #style=c          a=boxed  b=grouped  c=minimal (DEFAULT)
//   #width=28         explicitly set width (default: 28 for Signal)
//   #title=Pricing    #customer=Jordan M.   #ref=INV-1042   #date=auto
//   #total=1          sum the item prices
//   #foot=ask for bundle rate
//   #debug=1          append resolved width + device info
//
//   [items]   name,price[,group]     (or name|price|group)
//   [pay]     label,handle           repeatable; value is NEVER truncated
//   [notes]   free text, word-wrapped

// ------------------------------------------------------------- WIDTH
const WIDE = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf],
  [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff],
  [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6],
  [0x1f300, 0x1faff], [0x2600, 0x27bf], [0x2b00, 0x2bff],
  [0x1f000, 0x1f2ff], [0xfe0f, 0xfe0f], [0x20e3, 0x20e3],
];
const ZERO = [[0x0300, 0x036f], [0x200b, 0x200f], [0xfe00, 0xfe0e]];
const inR = (cp, rs) => rs.some(([lo, hi]) => cp >= lo && cp <= hi);
const charW = (cp) => (inR(cp, ZERO) ? 0 : inR(cp, WIDE) ? 2 : 1);

function dw(s) {
  let n = 0;
  for (const ch of String(s)) n += charW(ch.codePointAt(0));
  return n;
}

function clip(s, budget) {
  if (dw(s) <= budget) return s;
  let out = "", used = 0;
  for (const ch of s) {
    const c = charW(ch.codePointAt(0));
    if (used + c > budget - 1) break;
    out += ch; used += c;
  }
  return out + ".";
}

function padTo(s, w, right) {
  const gap = " ".repeat(Math.max(0, w - dw(s)));
  return right ? gap + s : s + gap;
}

function centerTo(s, w) {
  const p = Math.max(0, w - dw(s));
  const l = Math.floor(p / 2);
  return " ".repeat(l) + s + " ".repeat(p - l);
}

function wrap(text, budget) {
  const out = [];
  for (const para of String(text).split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (dw(word) > budget) {
        if (line) { out.push(line); line = ""; }
        let chunk = "";
        for (const ch of word) {
          if (dw(chunk + ch) > budget) { out.push(chunk); chunk = ""; }
          chunk += ch;
        }
        line = chunk;
        continue;
      }
      if (!line) line = word;
      else if (dw(line) + 1 + dw(word) <= budget) line += " " + word;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [""];
}

// ------------------------------------------------------------- MONEY
function money(v) {
  const raw = String(v).trim().replace(/[$,\s]/g, "");
  if (raw === "" || isNaN(Number(raw))) return String(v).trim();
  const n = Number(raw);
  const int = Math.abs(n - Math.round(n)) < 1e-9;
  const d = int ? 0 : 2;
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
const numOf = (p) => {
  const raw = String(p).replace(/[$,\s]/g, "");
  return isNaN(Number(raw)) ? 0 : Number(raw);
};

// ------------------------------------------------------------- PARSE
function splitRow(line) {
  if (line.includes("|")) return line.split("|");
  const out = []; let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parse(text, cfg) {
  const items = [], accounts = [], notes = [];
  let mode = "items";

  for (let line of String(text).split(/\r?\n/)) {
    line = line.trim();
    if (!line) { if (mode === "notes") notes.push(""); continue; }

    const sec = line.match(/^\[\s*([a-z ]+)\s*\]$/i);
    if (sec) {
      const s = sec[1].trim().toLowerCase();
      mode = /^(pay|account|accounts|payment|payments)$/.test(s) ? "pay"
           : /^(note|notes|memo)$/.test(s) ? "notes" : "items";
      continue;
    }

    const d = line.match(/^#\s*([a-z]+)\s*=\s*(.*)$/i);
    if (d) {
      const k = d[1].toLowerCase(), v = d[2].trim();
      if (k === "note") notes.push(v);
      else if (k === "pay" || k === "account") {
        const p = splitRow(v);
        if (p.length >= 2) accounts.push({ label: p[0].trim(), value: p.slice(1).join(",").trim() });
      } else if (["debug", "total"].includes(k)) {
        cfg[k] = /^(1|true|yes|on)$/i.test(v);
      } else if (k in cfg) cfg[k] = v;
      continue;
    }
    if (line.startsWith("#")) continue;

    if (mode === "notes") { notes.push(line); continue; }

    const p = splitRow(line);
    if (mode === "pay") {
      if (p.length >= 2) accounts.push({ label: p[0].trim(), value: p.slice(1).join(",").trim() });
      continue;
    }
    if (p.length < 2) continue;
    const name = p[0].trim();
    if (/^(name|item)$/i.test(name)) continue;
    items.push({ name, price: money(p[1]), group: (p[2] || "").trim() });
  }

  while (notes.length && notes[notes.length - 1] === "") notes.pop();
  return { items, accounts, notes };
}

// ------------------------------------------------------------- BUILD
function build(data, cfg) {
  const { items, accounts, notes } = data;
  const s = (cfg.style || "c").toLowerCase();
  const width = Math.max(20, parseInt(cfg._width, 10) || 28);

  let L, R, H, TL, TR, BL, BR, ML, MR, dot, prefixW;
  if (s === "a") {
    [L, R, H, TL, TR, BL, BR, ML, MR] = ["║", "║", "═", "╔", "╗", "╚", "╝", "╠", "╣"];
    dot = cfg.dot || "."; prefixW = 0;
  } else if (s === "b") {
    [L, R, H, TL, TR, BL, BR, ML, MR] = ["│", "│", "─", "┌", "┐", "└", "┘", "├", "┤"];
    dot = cfg.dot || "·"; prefixW = 0;
  } else {
    L = R = ""; H = "─"; TL = TR = BL = BR = ML = MR = "";
    dot = cfg.dot || "·"; prefixW = 0;
  }

  const bw = L ? 1 : 0;
  const inner = width - 2 * bw;
  const field = inner - 2 * bw;

  let priceW = 1;
  for (const r of items) priceW = Math.max(priceW, dw(r.price));
  const sum = items.reduce((a, r) => a + numOf(r.price), 0);
  if (cfg.total) priceW = Math.max(priceW, dw(money(sum)));
  const MIN_DOTS = 2;
  const nameBudget = field - prefixW - priceW - 2 - MIN_DOTS;
  if (nameBudget < 3) {
    return "width " + width + " too small — prices are " + priceW +
           " wide. Use #width=" + (width + (3 - nameBudget));
  }

  const hline = (l, r) => (L ? l + H.repeat(inner) + r : H.repeat(width));
  const shell = (t) => (L ? L + " " + centerTo(clip(t, field), field) + " " + R
                          : centerTo(clip(t, width), width).replace(/\s+$/, ""));
  const plain = (t) => (L ? L + " " + padTo(clip(t, field), field) + " " + R : t);

  const section = (label) => {
    if (L) return [hline(ML, MR), shell(label.toUpperCase())];
    const tag = " " + label.toUpperCase() + " ";
    const pad = Math.max(2, width - dw(tag));
    const l = Math.floor(pad / 2);
    return [H.repeat(l) + tag + H.repeat(pad - l)];
  };

  const leader = (label, value, box, vw) => {
    const w = vw !== undefined ? vw : dw(value);
    const pre = box ? "[  ] " : "";
    const nm = clip(label, nameBudget);
    const dots = field - dw(pre) - dw(nm) - w - 2;
    const body = pre + nm + " " + dot.repeat(Math.max(MIN_DOTS, dots)) + " " + padTo(value, w, true);
    return L ? L + " " + body + " " + R : body;
  };

  const out = [hline(TL, TR),
               shell(String(cfg.title || "Pricing").toUpperCase().split("").join(" "))];

  let date = cfg.date || "";
  if (/^auto$/i.test(date)) {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, "0");
    date = p2(d.getMonth() + 1) + "/" + p2(d.getDate());
  }
  const parts = [cfg.customer || "", cfg.ref || "", date].filter(Boolean);
  if (parts.length) {
    const one = parts.join(" · ");
    const room = L ? field : width;
    if (dw(one) <= room) out.push(shell(one));
    else for (const part of parts) for (const ln of wrap(part, room)) out.push(shell(ln));
  }
  out.push(hline(ML, MR));

  const hasGroups = items.some((r) => r.group);
  if (hasGroups && (s === "b" || s === "c")) {
    let seen = null;
    for (const r of items) {
      if (r.group !== seen) {
        if (r.group) out.push(...(s === "b" ? [shell("—  " + r.group.toUpperCase() + "  —")] : section(r.group)));
        seen = r.group;
      }
      out.push(leader(r.name, r.price, false));
    }
  } else {
    for (const r of items) out.push(leader(r.name, r.price, false));
  }

  if (cfg.total) {
    out.push(hline(ML, MR));
    out.push(leader("TOTAL", cfg.total ? money(sum) : "$", false));
  }

  if (accounts.length) {
    out.push(...section("pay to"));
    for (const a of accounts) {
      const room = field - dw(clip(a.label, nameBudget)) - MIN_DOTS - 2;
      if (dw(a.value) <= room) out.push(leader(a.label, a.value, false, dw(a.value)));
      else {
        out.push(plain(a.label.toUpperCase()));
        for (const ln of wrap(a.value, (L ? field : width) - 2)) out.push(plain("  " + ln));
      }
    }
  }

  if (notes.length) {
    out.push(...section("notes"));
    for (const n of notes) {
      if (!n) { out.push(plain("")); continue; }
      for (const ln of wrap(n, L ? field : width)) out.push(plain(ln));
    }
  }

  if (cfg.foot) { out.push(hline(ML, MR)); out.push(shell(cfg.foot)); }
  out.push(hline(BL, BR));

  let text = out.join("\n");
  return text;
}

// ------------------------------------------------------------- ENTRY
const cfg = {
  style: "c", width: "28", title: "Pricing", customer: "", ref: "",
  date: "", foot: "", dot: "", total: false, debug: false,
};

let raw = "";
const p = args.shortcutParameter;
if (p && typeof p === "object" && !Array.isArray(p)) {
  raw = p.items || p.text || "";
  for (const k of ["style", "width", "title", "customer", "ref", "date",
                   "foot", "dot", "total", "debug"]) {
    if (p[k] !== undefined && p[k] !== null && p[k] !== "") cfg[k] = p[k];
  }
  if (p.notes) raw += "\n[notes]\n" + (Array.isArray(p.notes) ? p.notes.join("\n") : p.notes);
  if (p.accounts) {
    const acc = Array.isArray(p.accounts)
      ? p.accounts.map((a) => (typeof a === "string" ? a : a.label + "," + a.value)).join("\n")
      : p.accounts;
    raw += "\n[pay]\n" + acc;
  }
} else if (typeof p === "string" && p.trim()) raw = p;
else if (args.plainTexts && args.plainTexts.length) raw = args.plainTexts.join("\n");
else raw = Pasteboard.paste() || "";

const data = parse(raw, cfg);
cfg._width = Math.max(20, parseInt(cfg.width, 10) || 28);

let result = (data.items.length || data.accounts.length || data.notes.length)
  ? build(data, cfg)
  : "No items parsed. Expected lines like:  Blue Widget,1200";

// Wrap in backticks for Signal code block
result = "```\n" + result + "\n```";

if (cfg.debug) {
  result += "\n\n[ width " + cfg._width + " | signal optimized ]";
}

Pasteboard.copy(result);
Script.setShortcutOutput(result);
if (config.runsInApp) {
  const a = new Alert();
  a.title = "Copied to clipboard";
  a.message = result;
  a.addAction("OK");
  await a.present();
}
Script.complete();
