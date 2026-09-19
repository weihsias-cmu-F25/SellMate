import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  blankItem,
  parseState,
  seedState,
  type AppState,
  type Item,
} from "./model";

const KEY = "sellmate-v1";
type Store = {
  state: AppState;
  storageError: boolean;
  notice: string;
  updateItem: (id: string, change: (item: Item) => Item) => void;
  createItem: () => string;
  settings: (
    patch: Partial<Pick<AppState, "connections" | "reminderDays">>,
  ) => void;
  notify: (message: string) => void;
  reset: (empty?: boolean) => void;
};
const Context = createContext<Store | null>(null);
function initial(): AppState {
  try {
    return parseState(localStorage.getItem(KEY)) || seedState();
  } catch {
    return seedState();
  }
}
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initial),
    [storageError, setStorageError] = useState(false),
    [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [state]);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  const notify = (message: string) => {
    clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(""), 6500);
  };
  const updateItem: Store["updateItem"] = (id, change) =>
    setState((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === id ? change(i) : i)),
    }));
  const createItem = () => {
    const item = blankItem();
    setState((s) => ({ ...s, items: [item, ...s.items] }));
    return item.id;
  };
  const settings: Store["settings"] = (patch) =>
    setState((s) => ({ ...s, ...patch }));
  const reset = (empty = false) =>
    setState(
      empty
        ? {
            version: 1,
            items: [],
            connections: {
              ebay: false,
              offerup: false,
              facebook: false,
              mercari: false,
            },
            reminderDays: 7,
          }
        : seedState(),
    );
  return (
    <Context.Provider
      value={{
        state,
        updateItem,
        createItem,
        settings,
        notify,
        reset,
        storageError,
        notice,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStore() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing store");
  return value;
}
export function useTask() {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  async function run(
    label: string,
    task: (signal: AbortSignal) => Promise<void>,
  ) {
    if (controller.current) return;
    const c = new AbortController();
    controller.current = c;
    setBusy(label);
    setError("");
    try {
      await task(c.signal);
    } catch (e) {
      if (!c.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Something went wrong. Please try again.",
        );
    } finally {
      if (!c.signal.aborted) {
        setBusy("");
        controller.current = null;
      }
    }
  }
  return { busy, error, setError, run };
}
