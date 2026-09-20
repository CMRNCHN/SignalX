// Invoice/receipt formatter for Signal monospace export (28 char width)
// Adapted from pricefmt.js with Signal-specific optimizations

const WIDE_CHARS = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf],
  [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff],
  [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6],
  [0x1f300, 0x1faff], [0x2600, 0x27bf], [0x2b00, 0x2bff],
  [0x1f000, 0x1f2ff], [0xfe0f, 0xfe0f], [0x20e3, 0x20e3],
];

const ZERO_WIDTH = [[0x0300, 0x036f], [0x200b, 0x200f], [0xfe00, 0xfe0e]];

const inRange = (cp: number, ranges: number[][]): boolean =>
  ranges.some(([lo, hi]) => cp >= lo && cp <= hi);

const charWidth = (cp: number): number =>
  inRange(cp, ZERO_WIDTH) ? 0 : inRange(cp, WIDE_CHARS) ? 2 : 1;

export function displayWidth(s: string): number {
  let n = 0;
  for (const ch of String(s)) {
    n += charWidth(ch.codePointAt(0) || 0);
  }
  return n;
}

export function padTo(s: string, w: number, right = false): string {
  const gap = " ".repeat(Math.max(0, w - displayWidth(s)));
  return right ? gap + s : s + gap;
}

export function center(s: string, w: number): string {
  const p = Math.max(0, w - displayWidth(s));
  const l = Math.floor(p / 2);
  return " ".repeat(l) + s + " ".repeat(p - l);
}

export function clip(s: string, budget: number): string {
  if (displayWidth(s) <= budget) return s;
  let out = "", used = 0;
  for (const ch of s) {
    const c = charWidth(ch.codePointAt(0) || 0);
    if (used + c > budget - 1) break;
    out += ch;
    used += c;
  }
  return out + ".";
}

function wrap(text: string, budget: number): string[] {
  const out = [];
  for (const para of String(text).split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (displayWidth(word) > budget) {
        if (line) {
          out.push(line);
          line = "";
        }
        let chunk = "";
        for (const ch of word) {
          if (displayWidth(chunk + ch) > budget) {
            out.push(chunk);
            chunk = "";
          }
          chunk += ch;
        }
        line = chunk;
        continue;
      }
      if (!line) line = word;
      else if (displayWidth(line) + 1 + displayWidth(word) <= budget)
        line += " " + word;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [""];
}

function formatMoney(v: string | number): string {
  const raw = String(v).trim().replace(/[$,\s]/g, "");
  if (raw === "" || isNaN(Number(raw))) return String(v).trim();
  const n = Number(raw);
  const int = Math.abs(n - Math.round(n)) < 1e-9;
  const d = int ? 0 : 2;
  return "$" + n.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

const numOf = (p: string | number): number => {
  const raw = String(p).replace(/[$,\s]/g, "");
  return isNaN(Number(raw)) ? 0 : Number(raw);
};

export interface InvoiceItem {
  name: string;
  price: string | number;
  group?: string;
}

export interface InvoiceData {
  title?: string;
  customer?: string;
  ref?: string;
  date?: string;
  items: InvoiceItem[];
  payMethods?: Array<{ label: string; value: string }>;
  notes?: string;
  footer?: string;
}

const SIGNAL_WIDTH = 28;

export function formatInvoice(data: InvoiceData): string {
  const items = data.items.map(item => ({
    ...item,
    price: formatMoney(item.price),
  }));

  const w = SIGNAL_WIDTH;
  const lines: string[] = [];

  // Top border
  lines.push("_".repeat(w));

  // Title
  if (data.title) {
    const title = data.title.toUpperCase();
    const titleSpaced = title.split("").join(" ");
    lines.push(center(titleSpaced, w));
  }

  // Header border
  lines.push("_".repeat(w));

  // Metadata line
  const parts = [data.customer, data.ref, data.date].filter(Boolean);
  if (parts.length) {
    const meta = parts.join(" · ");
    lines.push(center(meta, w));
  }

  lines.push("");

  // Calculate price width
  let priceW = 1;
  for (const r of items) priceW = Math.max(priceW, displayWidth(r.price));
  const sum = items.reduce((a, r) => a + numOf(r.price), 0);
  priceW = Math.max(priceW, displayWidth(formatMoney(sum)));

  const MIN_DOTS = 2;
  const nameSpace = w - priceW - 2 - MIN_DOTS;

  // Items with groups
  const hasGroups = items.some(r => r.group);
  let lastGroup: string | undefined;

  for (const item of items) {
    if (hasGroups && item.group !== lastGroup) {
      if (item.group) {
        const label = ` ${item.group.toUpperCase()} `;
        const dashes = Math.floor((w - displayWidth(label)) / 2);
        lines.push("-".repeat(dashes) + label + "-".repeat(w - dashes - displayWidth(label)));
      }
      lastGroup = item.group;
    }

    const name = clip(item.name, nameSpace);
    const dots = Math.max(MIN_DOTS, nameSpace - displayWidth(name) + priceW - displayWidth(item.price) - 1);
    const line = name + " " + ".".repeat(dots) + " " + padTo(item.price, priceW, true);
    lines.push(line.substring(0, w));
  }

  // Total
  lines.push("_".repeat(w));
  const totalName = "TOTAL";
  const totalPrice = formatMoney(sum);
  const totalDots = Math.max(MIN_DOTS, nameSpace - displayWidth(totalName) + priceW - displayWidth(totalPrice) - 1);
  const totalLine = totalName + " " + ".".repeat(totalDots) + " " + padTo(totalPrice, priceW, true);
  lines.push(totalLine.substring(0, w));
  lines.push("_".repeat(w));

  // Payment methods
  if (data.payMethods && data.payMethods.length) {
    lines.push("");
    const payLabel = " PAY TO ";
    const dashes = Math.floor((w - displayWidth(payLabel)) / 2);
    lines.push("-".repeat(dashes) + payLabel + "-".repeat(w - dashes - displayWidth(payLabel)));

    for (const method of data.payMethods) {
      const label = clip(method.label, nameSpace);
      const value = method.value;
      if (displayWidth(value) <= w - displayWidth(label) - 3) {
        const dots = Math.max(MIN_DOTS, nameSpace - displayWidth(label) + priceW - displayWidth(value) - 1);
        const line = label + " " + ".".repeat(dots) + " " + padTo(value, priceW, true);
        lines.push(line.substring(0, w));
      } else {
        lines.push(label.toUpperCase());
        for (const ln of wrap(value, w - 2)) {
          lines.push("  " + ln);
        }
      }
    }
  }

  // Notes
  if (data.notes) {
    lines.push("");
    const notesLabel = " NOTES ";
    const dashes = Math.floor((w - displayWidth(notesLabel)) / 2);
    lines.push("-".repeat(dashes) + notesLabel + "-".repeat(w - dashes - displayWidth(notesLabel)));
    for (const ln of wrap(data.notes, w)) {
      lines.push(ln);
    }
  }

  // Footer
  if (data.footer) {
    lines.push("");
    lines.push("_".repeat(w));
    const footer = center(data.footer, w);
    lines.push(footer);
    lines.push("_".repeat(w));
  }

  return lines.join("\n");
}

export function exportForSignal(invoice: InvoiceData): string {
  const formatted = formatInvoice(invoice);
  return "```\n" + formatted + "\n```";
}
