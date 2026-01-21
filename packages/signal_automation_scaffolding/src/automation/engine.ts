import type { IncomingMessage, DraftResult, Rule } from './types';

/**
 * Rule matching function - checks if a message matches a rule's criteria
 */
function matches(rule: Rule, m: IncomingMessage): boolean {
  const body = m.body.toLowerCase();
  
  // Match by sender
  if (rule.match.from && rule.match.from.length > 0) {
    const senderLower = m.sender.toLowerCase();
    const matchesSender = rule.match.from.some(f => 
      senderLower.includes(f.toLowerCase()) || f.toLowerCase().includes(senderLower)
    );
    if (!matchesSender) return false;
  }

  // Match by contains (substring)
  if (rule.match.contains && rule.match.contains.length > 0) {
    const matchesContains = rule.match.contains.some(term => 
      body.includes(term.toLowerCase())
    );
    if (!matchesContains) return false;
  }

  // Match by regex patterns
  if (rule.match.regex && rule.match.regex.length > 0) {
    const matchesRegex = rule.match.regex.some(pattern => {
      try {
        const regex = new RegExp(pattern, 'i');
        return regex.test(m.body);
      } catch (e) {
        console.warn(`Invalid regex pattern in rule ${rule.id}: ${pattern}`, e);
        return false;
      }
    });
    if (!matchesRegex) return false;
  }

  // If no match criteria specified, rule matches everything
  if (!rule.match.from && !rule.match.contains && !rule.match.regex) {
    return true;
  }

  return true;
}

/**
 * Evaluate a single rule against a message
 */
function evaluateRule(rule: Rule, message: IncomingMessage): DraftResult | null {
  if (!rule.enabled) {
    return null;
  }

  if (!matches(rule, message)) {
    return null;
  }

  // Rule matched - generate result based on action type
  const confidence = calculateConfidence(rule, message);
  const tags = [`rule:${rule.id}`];

  switch (rule.action.type) {
    case 'DRAFT':
      return {
        action: 'DRAFT',
        draft: rule.action.template || '',
        confidence,
        tags,
      };

    case 'QUEUE_SEND':
      return {
        action: 'QUEUE_SEND',
        draft: rule.action.template || '',
        confidence,
        tags,
      };

    case 'NONE':
    default:
      return {
        action: 'NONE',
        confidence: 0.1,
        tags,
      };
  }
}

/**
 * Calculate confidence score for a rule match
 * Higher confidence = more specific match criteria
 */
function calculateConfidence(rule: Rule, message: IncomingMessage): number {
  let score = 0.5; // Base confidence

  // More specific matches = higher confidence
  if (rule.match.from && rule.match.from.length > 0) {
    score += 0.2;
  }
  if (rule.match.contains && rule.match.contains.length > 0) {
    score += 0.1 * Math.min(rule.match.contains.length, 3);
  }
  if (rule.match.regex && rule.match.regex.length > 0) {
    score += 0.15;
  }

  // If multiple criteria match, boost confidence
  const criteriaCount = [
    rule.match.from?.length || 0,
    rule.match.contains?.length || 0,
    rule.match.regex?.length || 0,
  ].filter(c => c > 0).length;

  if (criteriaCount > 1) {
    score += 0.1;
  }

  return Math.min(score, 1.0);
}

/**
 * Run automation engine against a message
 * Returns the highest confidence result from matching rules
 */
export function runAutomation(rules: Rule[], message: IncomingMessage): DraftResult {
  if (!rules || rules.length === 0) {
    return { action: 'NONE', confidence: 0.1 };
  }

  const results: DraftResult[] = [];

  // Evaluate all rules
  for (const rule of rules) {
    const result = evaluateRule(rule, message);
    if (result && result.action !== 'NONE') {
      results.push(result);
    }
  }

  // If no matches, return NONE
  if (results.length === 0) {
    return { action: 'NONE', confidence: 0.1 };
  }

  // Sort by confidence (highest first)
  results.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  // Return highest confidence result
  const best = results[0];

  // Merge tags from all matching rules
  const allTags = results.flatMap(r => r.tags || []);
  return {
    ...best,
    tags: [...new Set(allTags)], // Remove duplicates
  };
}

/**
 * Validate a rule structure
 */
export function validateRule(rule: Partial<Rule>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!rule.id || rule.id.trim().length === 0) {
    errors.push('Rule ID is required');
  }

  if (rule.match) {
    const hasAnyMatch = 
      (rule.match.from && rule.match.from.length > 0) ||
      (rule.match.contains && rule.match.contains.length > 0) ||
      (rule.match.regex && rule.match.regex.length > 0);

    if (!hasAnyMatch) {
      errors.push('Rule must have at least one match criterion');
    }

    // Validate regex patterns
    if (rule.match.regex) {
      for (const pattern of rule.match.regex) {
        try {
          new RegExp(pattern);
        } catch (e) {
          errors.push(`Invalid regex pattern: ${pattern}`);
        }
      }
    }
  } else {
    errors.push('Rule match criteria is required');
  }

  if (!rule.action || !rule.action.type) {
    errors.push('Rule action type is required');
  } else if (!['NONE', 'DRAFT', 'QUEUE_SEND'].includes(rule.action.type)) {
    errors.push(`Invalid action type: ${rule.action.type}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a new rule with defaults
 */
export function createRule(overrides: Partial<Rule>): Rule {
  return {
    id: overrides.id || `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    enabled: overrides.enabled !== undefined ? overrides.enabled : true,
    match: overrides.match || { contains: [] },
    action: overrides.action || { type: 'DRAFT', template: '' },
  };
}
