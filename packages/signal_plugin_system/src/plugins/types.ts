import type React from 'react';

export type Plugin = {
  id: string;
  name: string;
  flag?: string; // e.g. "ui.panel.tools"
  render?: () => React.ReactNode;
  commands?: { id:string; title:string; run:()=>Promise<void> }[];
};
