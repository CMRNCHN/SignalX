import type { Rule } from './types';
import { validateRule, createRule } from './engine';

/**
 * Default rule templates for common automation scenarios
 */
export const DEFAULT_RULES: Rule[] = [
  {
    id: 'polite_ack',
    enabled: true,
    match: {
      contains: ['hey', 'hello', 'hi', 'yo'],
    },
    action: {
      type: 'DRAFT',
      template: 'Got it - give me a second and I\'ll get back to you.',
    },
  },
  {
    id: 'schedule_prompt',
    enabled: true,
    match: {
      contains: ['when', 'time', 'today', 'tomorrow', 'schedule'],
    },
    action: {
      type: 'DRAFT',
      template: 'What time works for you? I can do a quick check and confirm.',
    },
  },
  {
    id: 'question_ack',
    enabled: false,
    match: {
      contains: ['?'],
    },
    action: {
      type: 'DRAFT',
      template: 'Let me check on that and get back to you.',
    },
  },
];

/**
 * Rule templates for quick creation
 */
export const RULE_TEMPLATES = {
  greeting: (): Rule =>
    createRule({
      match: { contains: ['hello', 'hi', 'hey'] },
      action: { type: 'DRAFT', template: 'Hello! How can I help?' },
    }),

  question: (): Rule =>
    createRule({
      match: { contains: ['?'] },
      action: { type: 'DRAFT', template: 'Let me look into that for you.' },
    }),

  urgent: (): Rule =>
    createRule({
      match: { contains: ['urgent', 'asap', 'emergency'] },
      action: { type: 'DRAFT', template: 'I see this is urgent. Let me prioritize this.' },
    }),

  from_sender: (sender: string): Rule =>
    createRule({
      match: { from: [sender] },
      action: { type: 'DRAFT', template: 'Thanks for reaching out!' },
    }),

  contains_keyword: (keyword: string, response: string): Rule =>
    createRule({
      match: { contains: [keyword] },
      action: { type: 'DRAFT', template: response },
    }),
};

/**
 * Load rules from storage
 */
export function loadRules(): Rule[] {
  try {
    const stored = localStorage.getItem('signalx.automation.rules');
    if (!stored) return DEFAULT_RULES;

    const parsed = JSON.parse(stored) as Rule[];
    // Validate all rules
    return parsed.filter(rule => {
      const validation = validateRule(rule);
      if (!validation.valid) {
        console.warn(`Invalid rule ${rule.id}:`, validation.errors);
        return false;
      }
      return true;
    });
  } catch (e) {
    console.error('Failed to load rules:', e);
    return DEFAULT_RULES;
  }
}

/**
 * Save rules to storage
 */
export function saveRules(rules: Rule[]): void {
  try {
    // Validate all rules before saving
    const validRules = rules.filter(rule => {
      const validation = validateRule(rule);
      if (!validation.valid) {
        console.warn(`Skipping invalid rule ${rule.id}:`, validation.errors);
        return false;
      }
      return true;
    });

    localStorage.setItem('signalx.automation.rules', JSON.stringify(validRules));
  } catch (e) {
    console.error('Failed to save rules:', e);
  }
}

/**
 * Add a new rule
 */
export function addRule(rule: Rule): Rule {
  const rules = loadRules();
  
  // Validate rule
  const validation = validateRule(rule);
  if (!validation.valid) {
    throw new Error(`Invalid rule: ${validation.errors.join(', ')}`);
  }

  // Check for duplicate ID
  if (rules.some(r => r.id === rule.id)) {
    throw new Error(`Rule with ID ${rule.id} already exists`);
  }

  rules.push(rule);
  saveRules(rules);
  return rule;
}

/**
 * Update an existing rule
 */
export function updateRule(updated: Rule): Rule {
  const rules = loadRules();
  
  // Validate rule
  const validation = validateRule(updated);
  if (!validation.valid) {
    throw new Error(`Invalid rule: ${validation.errors.join(', ')}`);
  }

  const index = rules.findIndex(r => r.id === updated.id);
  if (index === -1) {
    throw new Error(`Rule with ID ${updated.id} not found`);
  }

  rules[index] = updated;
  saveRules(rules);
  return updated;
}

/**
 * Remove a rule
 */
export function removeRule(ruleId: string): boolean {
  const rules = loadRules();
  const filtered = rules.filter(r => r.id !== ruleId);
  
  if (filtered.length === rules.length) {
    return false; // Rule not found
  }

  saveRules(filtered);
  return true;
}

/**
 * Toggle rule enabled state
 */
export function toggleRule(ruleId: string): Rule {
  const rules = loadRules();
  const rule = rules.find(r => r.id === ruleId);
  
  if (!rule) {
    throw new Error(`Rule with ID ${ruleId} not found`);
  }

  return updateRule({
    ...rule,
    enabled: !rule.enabled,
  });
}

/**
 * Get rule by ID
 */
export function getRule(ruleId: string): Rule | undefined {
  const rules = loadRules();
  return rules.find(r => r.id === ruleId);
}
