import { useAppScreen, useContacts, useOrders, useProducts, useThreads } from "../../context/SignalXContext";
import { Avatar } from "../shared/Avatar";
import { Badge } from "../shared/Badge";
import { Button } from "../shared/Button";
import { money } from "../shared/format";
import { SegmentsSidebar } from "./SegmentsSidebar";
import type { SegmentFilter } from "./ThreadList";

export function ContextRail({
  segment,
  onSegment,
}: {
  segment: SegmentFilter;
  onSegment: (next: SegmentFilter) => void;
}) {
  const { threads, selectedThreadId } = useThreads();
  const { contacts, setSelectedContactId } = useContacts();
  const { orders } = useOrders();
  const { products } = useProducts();
  const { setScreen } = useAppScreen();
  const thread = threads.find((t) => t.id === selectedThreadId) ?? null;
  const contact = contacts.find((c) => c.id === thread?.buyerId);
  const buyerOrders = orders.filter((o) => o.buyerId === thread?.buyerId);
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;

  return (
    <aside className="flex h-full min-h-0 flex-col gap-4 overflow-auto rounded-xl bg-[var(--panel)] p-4">
      <SegmentsSidebar segment={segment} onChange={onSegment} />
      {!thread || !contact ? (
        <p className="text-[var(--text-dim)]">Select a conversation to see standing, notes, and orders.</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Avatar label={contact.name} />
            <div className="min-w-0">
              <p className="truncate font-medium">{contact.alias || contact.name}</p>
              <p className="truncate text-sm text-[var(--text-dim)]">{contact.phone}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide text-[var(--text-dim)]">Standing</p>
            <Badge tone={contact.meta?.standing === "Open balance" ? "warn" : "ok"}>
              {contact.meta?.standing ?? "New"}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1">
            {contact.meta?.favorite && <Badge tone="cta">Favorite</Badge>}
            {contact.meta?.vip && <Badge tone="warn">VIP</Badge>}
            {contact.meta?.coresBuyer && <Badge tone="ok">Cores buyer</Badge>}
          </div>
          {contact.meta?.notes && (
            <p className="text-sm text-[var(--text-dim)]">{contact.meta.notes}</p>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide text-[var(--text-dim)]">Orders</p>
            {buyerOrders.length === 0 && (
              <p className="text-sm text-[var(--text-dim)]">No orders for this chat.</p>
            )}
            {buyerOrders.map((o) => (
              <div key={o.id} className="rounded-lg bg-[var(--panel-2)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{o.id}</span>
                  <Badge tone={o.status === "pending" ? "warn" : "ok"}>{o.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-[var(--text-dim)]">
                  {o.items.map((i) => `${productName(i.productId)} × ${i.qty}`).join(", ")} · {money(o.total)}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide text-[var(--text-dim)]">Actions</p>
            <Button
              onClick={() => {
                setSelectedContactId(contact.id);
                setScreen("people");
              }}
            >
              Open in People
            </Button>
            <Button onClick={() => setScreen("orders")}>Open orders</Button>
          </div>
        </>
      )}
    </aside>
  );
}
