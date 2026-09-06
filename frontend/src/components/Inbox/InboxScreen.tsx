import { useState } from "react";
import { Nav } from "../shared/Nav";
import { ContextRail } from "./ContextRail";
import { ThreadDetail } from "./ThreadDetail";
import { ThreadList, type SegmentFilter } from "./ThreadList";

export function InboxScreen() {
  const [segment, setSegment] = useState<SegmentFilter>(null);
  return (
    <div className="grid h-screen min-h-0 grid-cols-[minmax(180px,200px)_minmax(280px,320px)_1fr_minmax(280px,320px)] gap-2 overflow-hidden p-2">
      <Nav />
      <ThreadList segment={segment} />
      <ThreadDetail />
      <ContextRail segment={segment} onSegment={setSegment} />
    </div>
  );
}
