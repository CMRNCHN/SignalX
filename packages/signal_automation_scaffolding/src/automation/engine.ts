import type { IncomingMessage, DraftResult, Rule } from './types';

function matches(rule: Rule, m: IncomingMessage) {
  const b = m.body.toLowerCase();
  if (rule.match.from && !rule.match.from.includes(m.sender)) return false;

  if (rule.match.contains) {
    for (const s of rule.match.contains) if (b.includes(s.toLowerCase())) return true;
  }
  if (rule.match.regex) {
    for (const r of rule.match.regex) {
      try { if (new RegExp(r,'i').test(m.body)) return true; } catch {}
    }
  }
  return false;
}

export function runAutomation(rules: Rule[], m: IncomingMessage): DraftResult {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!matches(rule, m)) continue;

    if (rule.action.type === 'DRAFT') {
      return { action: 'DRAFT', draft: rule.action.template ?? '', confidence: 0.65, tags: ['rule:'+rule.id] };
    }
    if (rule.action.type === 'QUEUE_SEND') {
      return { action: 'QUEUE_SEND', draft: rule.action.template ?? '', confidence: 0.65, tags: ['rule:'+rule.id] };
    }
  }
  return { action: 'NONE', confidence: 0.1 };
}
