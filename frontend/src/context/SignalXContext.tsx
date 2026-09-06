import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  Contact,
  Fixtures,
  Menu,
  MenuChoice,
  Order,
  Product,
  ScreenId,
  Thread,
} from "./types";

type SignalXContextValue = {
  ready: boolean;
  error: string | null;
  screen: ScreenId;
  setScreen: (screen: ScreenId) => void;
  threads: Thread[];
  contacts: Contact[];
  products: Product[];
  orders: Order[];
  menus: Menu[];
  selectedThreadId: string | null;
  setSelectedThreadId: (id: string | null) => void;
  selectedContactId: string | null;
  setSelectedContactId: (id: string | null) => void;
  selectedChoiceId: string | null;
  setSelectedChoiceId: (id: string | null) => void;
  updateChoice: (menuId: string, choice: MenuChoice) => void;
  deleteChoice: (menuId: string, choiceId: string) => void;
  appendLocalReply: (threadId: string, text: string) => void;
};

const SignalXContext = createContext<SignalXContextValue | null>(null);

const empty: Fixtures = {
  threads: [],
  contacts: [],
  products: [],
  orders: [],
  menus: [],
};

export function SignalXProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Fixtures>(empty);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<ScreenId>("inbox");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/fixtures/signalx_fixtures.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Fixtures HTTP ${r.status}`);
        return r.json() as Promise<Fixtures>;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setSelectedThreadId(json.threads[0]?.id ?? null);
        setSelectedContactId(json.contacts[0]?.id ?? null);
        setSelectedChoiceId(json.menus[0]?.choices[0]?.id ?? null);
        setReady(true);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateChoice = useCallback((menuId: string, choice: MenuChoice) => {
    setData((prev) => ({
      ...prev,
      menus: prev.menus.map((m) =>
        m.id === menuId
          ? {
              ...m,
              choices: m.choices.some((c) => c.id === choice.id)
                ? m.choices.map((c) => (c.id === choice.id ? choice : c))
                : [...m.choices, choice],
            }
          : m,
      ),
    }));
  }, []);

  const deleteChoice = useCallback((menuId: string, choiceId: string) => {
    setData((prev) => ({
      ...prev,
      menus: prev.menus.map((m) =>
        m.id === menuId ? { ...m, choices: m.choices.filter((c) => c.id !== choiceId) } : m,
      ),
    }));
    setSelectedChoiceId((id) => (id === choiceId ? null : id));
  }, []);

  const appendLocalReply = useCallback((threadId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setData((prev) => ({
      ...prev,
      threads: prev.threads.map((t) => {
        if (t.id !== threadId) return t;
        return {
          ...t,
          lastMessage: trimmed,
          needsSend: false,
          messages: [
            ...t.messages,
            {
              id: `local-${Date.now()}`,
              role: "seller" as const,
              text: trimmed,
              timestamp: Date.now(),
              read: true,
            },
          ],
        };
      }),
    }));
  }, []);

  const value = useMemo<SignalXContextValue>(
    () => ({
      ready,
      error,
      screen,
      setScreen,
      threads: data.threads,
      contacts: data.contacts,
      products: data.products,
      orders: data.orders,
      menus: data.menus,
      selectedThreadId,
      setSelectedThreadId,
      selectedContactId,
      setSelectedContactId,
      selectedChoiceId,
      setSelectedChoiceId,
      updateChoice,
      deleteChoice,
      appendLocalReply,
    }),
    [
      ready,
      error,
      screen,
      data,
      selectedThreadId,
      selectedContactId,
      selectedChoiceId,
      updateChoice,
      deleteChoice,
      appendLocalReply,
    ],
  );

  return <SignalXContext.Provider value={value}>{children}</SignalXContext.Provider>;
}

function useSignalX(): SignalXContextValue {
  const ctx = useContext(SignalXContext);
  if (!ctx) throw new Error("SignalX hooks must be used within SignalXProvider");
  return ctx;
}

export function useThreads() {
  const ctx = useSignalX();
  return {
    threads: ctx.threads,
    selectedThreadId: ctx.selectedThreadId,
    setSelectedThreadId: ctx.setSelectedThreadId,
    appendLocalReply: ctx.appendLocalReply,
  };
}

export function useContacts() {
  const ctx = useSignalX();
  return {
    contacts: ctx.contacts,
    selectedContactId: ctx.selectedContactId,
    setSelectedContactId: ctx.setSelectedContactId,
  };
}

export function useProducts() {
  return { products: useSignalX().products };
}

export function useOrders() {
  return { orders: useSignalX().orders };
}

export function useMenus() {
  const ctx = useSignalX();
  return {
    menus: ctx.menus,
    selectedChoiceId: ctx.selectedChoiceId,
    setSelectedChoiceId: ctx.setSelectedChoiceId,
    updateChoice: ctx.updateChoice,
    deleteChoice: ctx.deleteChoice,
  };
}

export function useAppScreen() {
  const ctx = useSignalX();
  return {
    screen: ctx.screen,
    setScreen: ctx.setScreen,
    ready: ctx.ready,
    error: ctx.error,
  };
}
