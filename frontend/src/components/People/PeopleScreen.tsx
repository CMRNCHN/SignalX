import { Nav } from "../shared/Nav";
import { ContactDetail } from "./ContactDetail";
import { ContactList } from "./ContactList";

export function PeopleScreen() {
  return (
    <div className="grid h-screen min-h-0 grid-cols-[minmax(180px,200px)_1fr] gap-2 overflow-hidden p-2">
      <Nav />
      <div className="grid min-h-0 grid-cols-1 gap-4 overflow-auto rounded-xl bg-[var(--panel)] p-4 lg:grid-cols-2">
        <ContactList />
        <ContactDetail />
      </div>
    </div>
  );
}
