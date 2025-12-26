import type { Rule } from './types';

export const DEFAULT_RULES: Rule[] = [
  { id: 'polite_ack', enabled: true, match: { contains: ['hey','hello','yo'] }, action: { type: 'DRAFT', template: 'Got it — give me a second and I’ll get back to you.' } },
  { id: 'schedule_prompt', enabled: true, match: { contains: ['when','time','today'] }, action: { type: 'DRAFT', template: 'What time works for you? I can do a quick check and confirm.' } },
];
