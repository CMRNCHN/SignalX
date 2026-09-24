import type { ContactMeta, Customer, GroupMeta, IvrMenus, IvrPreviewStep, IvrSettings } from "../../api";
import { IvrMenuComposer } from "../../IvrMenuComposer";
import { AllowlistList } from "./AllowlistList";

type Props = {
  settings: IvrSettings | null;
  onSave: (patch: Partial<IvrSettings>) => void;
  onAllowCurrentChat: () => void;
  onRemoveFromAllowlist: (threadId: string) => void;
  contacts: ContactMeta[];
  groups: GroupMeta[];
  customers: Customer[];
  menus: IvrMenus | null;
  menusBusy: boolean;
  menusError: string | null;
  previewSteps: IvrPreviewStep[];
  onMenusChange: (menus: IvrMenus) => void;
  onSaveMenus: () => void;
  onReloadMenus: () => void;
  onResetDemo: () => void;
  onPreview: (inputs: string[]) => void;
};

/** Buyer menu tab: IVR switches, approved chats, and the menu composer. */
export function BuyerMenuSettings({
  settings,
  onSave,
  onAllowCurrentChat,
  onRemoveFromAllowlist,
  contacts,
  groups,
  customers,
  menus,
  menusBusy,
  menusError,
  previewSteps,
  onMenusChange,
  onSaveMenus,
  onReloadMenus,
  onResetDemo,
  onPreview,
}: Props) {
  return (
    <>
      <div className="settings-card">
        <div className="settings-card-head">
          <h3>Buyer text menu</h3>
          <span className={`status-pill status-${settings?.enabled ? "ok" : "muted"}`}>
            {settings?.enabled ? "ON" : "OFF"}
          </span>
        </div>
        <p className="hint tight">
          When it’s on, buyers can text a number (1 for products, 2 to order, and so on) and SignalX
          answers for you. Turn it on here, then turn it on for each chat you want. Group chats are
          never automated.
        </p>
        {settings && (
          <>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => onSave({ enabled: e.target.checked })}
              />
              Turn on buyer menus for this account
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.require_allowlist}
                onChange={(e) => onSave({ require_allowlist: e.target.checked })}
              />
              Only chats I approve (recommended)
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={!!settings.hide_zero_stock}
                onChange={(e) => onSave({ hide_zero_stock: e.target.checked })}
              />
              Don’t show products that are out of stock
            </label>
            <div className="allowlist-head">
              <span className="field-label">Approved chats ({settings.allowlist.length})</span>
              <button type="button" className="ghost-btn" onClick={onAllowCurrentChat}>
                Add this chat
              </button>
            </div>
            {settings.allowlist.length === 0 ? (
              <p className="hint tight">
                None yet — open a 1:1 chat and turn on the buyer menu there, or add it here.
              </p>
            ) : (
              <AllowlistList
                threadIds={settings.allowlist}
                contacts={contacts}
                groups={groups}
                customers={customers}
                onRemove={onRemoveFromAllowlist}
              />
            )}
          </>
        )}
      </div>

      <div className="settings-card">
        <div className="settings-card-head">
          <h3>Build the menu</h3>
        </div>
        <p className="hint tight">
          Switch between a visual map of the conversation and a plain text script. Edit a screen,
          test it on the phone pad, then save.
        </p>
        <IvrMenuComposer
          menus={menus}
          busy={menusBusy}
          error={menusError}
          previewSteps={previewSteps}
          onChange={onMenusChange}
          onSave={onSaveMenus}
          onReload={onReloadMenus}
          onResetDemo={onResetDemo}
          onPreview={onPreview}
        />
      </div>
    </>
  );
}
