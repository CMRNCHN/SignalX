export type AutomationAction = 'NONE' | 'DRAFT' | 'QUEUE_SEND';

export type IncomingMessage = {
  threadId: string;
  sender: string;
  body: string;
  ts: number;
};

export type DraftResult = {
  action: AutomationAction;
  draft?: string;
  confidence?: number;
  tags?: string[];
};

export type Rule = {
  id: string;
  enabled: boolean;
  match: { contains?: string[]; regex?: string[]; from?: string[]; };
  action: { type: AutomationAction; template?: string; };
};
