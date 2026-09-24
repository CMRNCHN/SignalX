import type { ContactMeta, Customer, GroupMeta } from "../../api";
import { threadTitle } from "../../format";

type Props = {
  threadIds: string[];
  contacts: ContactMeta[];
  groups: GroupMeta[];
  customers: Customer[];
  onRemove: (threadId: string) => void;
};

/** Named list of allowlisted chats with a Remove button per row. */
export function AllowlistList({ threadIds, contacts, groups, customers, onRemove }: Props) {
  return (
    <ul className="allowlist-list">
      {threadIds.map((tid) => (
        <li key={tid}>
          <div>
            <div className="thread-name">{threadTitle(tid, contacts, groups, customers)}</div>
            <div className="convo-sub">{tid}</div>
          </div>
          <button type="button" className="ghost-btn" onClick={() => onRemove(tid)}>
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
