import { useAppScreen } from "./context/SignalXContext";
import { InboxScreen } from "./components/Inbox/InboxScreen";
import { MenuBuilderScreen } from "./components/MenuBuilder/MenuBuilderScreen";
import { PeopleScreen } from "./components/People/PeopleScreen";
import { SettingsScreen } from "./components/Settings/SettingsScreen";
import { StubScreen } from "./components/StubScreen";

export default function App() {
  const { screen, ready, error } = useAppScreen();

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg)] text-[var(--text-dim)]">
        Loading fixtures…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg)] text-[var(--danger)]">
        {error}
      </div>
    );
  }

  if (screen === "inbox") return <InboxScreen />;
  if (screen === "people") return <PeopleScreen />;
  if (screen === "menu") return <MenuBuilderScreen />;
  if (screen === "settings") return <SettingsScreen />;
  return <StubScreen id={screen} />;
}
