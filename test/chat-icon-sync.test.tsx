// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

import { ChatProvider } from "../components/chat-context";
import { ChatIconsProvider, useChatIcons } from "../components/chat-icons";
import type { ChatIconState } from "../lib/chat-icons";

const stored = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => void stored.set(key, value),
});

afterEach(() => {
  cleanup();
  stored.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function Probe() {
  const icons = useChatIcons();
  return (
    <>
      <output data-testid="icon">{icons.iconOf("thr_a", "Fix login")}</output>
      <output data-testid="second-icon">{icons.pickOf("thr_b")}</output>
      <button onClick={() => icons.openPicker({ id: "thr_a", title: "Fix login" })}>Pick</button>
    </>
  );
}

const app = definePluginApp((app) => app.slots.experimental_threadList({
  id: "icon-sync",
  title: "Icon sync",
  component: () => <ChatProvider><ChatIconsProvider><Probe /></ChatIconsProvider></ChatProvider>,
}));

async function mount(
  get: () => unknown,
  set: (input: unknown) => unknown = () => ({ revision: 0, icons: {} }),
  options: { enabled?: boolean; connection?: "connected" | "reconnecting" } = {},
) {
  const loaded = await loadPluginApp(app);
  const view = renderSlot(
    loaded.threadLists[0]!,
    { activeThreadId: null, activeProjectId: null, isCompactViewport: false, onNavigate: () => {}, searchQuery: "" },
    {
      settings: { language: "English", avatar: options.enabled === false ? "Project letter" : "Icon from the title" },
      realtimeConnectionState: options.connection ?? "connected",
      rpc: { chaticons_get: get, chaticons_set: set },
    },
  );
  await act(async () => {});
  return view;
}

async function pick(icon: string) {
  fireEvent.click(screen.getByText("Pick"));
  fireEvent.click(screen.getByRole("radio", { name: icon }));
  await act(async () => {});
}

describe("chat icon sync", () => {
  it("keeps a newer realtime update when the initial read completes late", async () => {
    const initial = deferred<ChatIconState>();
    const view = await mount(() => initial.promise);
    await view.behavior.emitRealtime("chat-icons", { revision: 1, icons: { thr_a: "Star" } });
    await act(async () => { initial.resolve({ revision: 0, icons: {} }); });
    expect(screen.getByTestId("icon").textContent).toBe("Star");
    expect(JSON.parse(stored.get("chat-sidebar/chat-icons")!).revision).toBe(1);
  });

  it("ignores old realtime snapshots and old save responses", async () => {
    const save = deferred<ChatIconState>();
    const view = await mount(() => ({ revision: 1, icons: {} }), () => save.promise);
    await pick("Star");
    await view.behavior.emitRealtime("chat-icons", { revision: 3, icons: { thr_a: "Zap" } });
    await act(async () => { save.resolve({ revision: 2, icons: { thr_a: "Star" } }); });
    await view.behavior.emitRealtime("chat-icons", { revision: 2, icons: { thr_a: "Star" } });
    expect(screen.getByTestId("icon").textContent).toBe("Zap");
  });

  it("retries a transient initial read failure", async () => {
    vi.useFakeTimers();
    const get = vi.fn().mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValue({ revision: 1, icons: { thr_a: "Star" } });
    await mount(get);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(get).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("icon").textContent).toBe("Star");
  });

  it("bounds load retries and cancels them on unmount", async () => {
    vi.useFakeTimers();
    const get = vi.fn().mockRejectedValue(new Error("offline"));
    const view = await mount(get);
    await act(async () => { await vi.advanceTimersByTimeAsync(14_000); });
    expect(get).toHaveBeenCalledTimes(4);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(get).toHaveBeenCalledTimes(4);
    await view.behavior.setRealtimeConnectionState("reconnecting");
    expect(get).toHaveBeenCalledTimes(5);
    view.lifecycle.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(get).toHaveBeenCalledTimes(5);
  });

  it("loads while realtime is reconnecting and refreshes after reconnect", async () => {
    const get = vi.fn().mockResolvedValueOnce({ revision: 1, icons: { thr_a: "Star" } })
      .mockResolvedValue({ revision: 2, icons: { thr_a: "Zap" } });
    const view = await mount(get, undefined, { connection: "reconnecting" });
    expect(screen.getByTestId("icon").textContent).toBe("Star");
    await view.behavior.setRealtimeConnectionState("connected");
    expect(get).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("icon").textContent).toBe("Zap");
  });

  it("saves in pick order and continues after a failed earlier save", async () => {
    const first = deferred<ChatIconState>();
    const error = vi.spyOn(toast, "error").mockImplementation(() => "error-toast");
    const set = vi.fn().mockImplementationOnce(() => first.promise)
      .mockResolvedValue({ revision: 2, icons: { thr_a: "Zap", thr_b: "Lock" } });
    const view = await mount(() => ({ revision: 0, icons: {} }), set);
    await pick("Star");
    await pick("Zap");
    expect(set).toHaveBeenCalledTimes(1);
    await view.behavior.emitRealtime("chat-icons", { revision: 1, icons: { thr_b: "Lock" } });
    await act(async () => { first.reject(new Error("first save failed")); });
    expect(set.mock.calls.map(([input]) => input)).toEqual([
      { threadId: "thr_a", icon: "Star" },
      { threadId: "thr_a", icon: "Zap" },
    ]);
    expect(error).toHaveBeenCalledOnce();
    expect(screen.getByTestId("icon").textContent).toBe("Zap");
    expect(screen.getByTestId("second-icon").textContent).toBe("Lock");
  });

  it("keeps confirmed picks after a failed save and can reset to automatic", async () => {
    vi.spyOn(toast, "error").mockImplementation(() => "error-toast");
    const set = vi.fn().mockRejectedValueOnce(new Error("save failed"))
      .mockResolvedValue({ revision: 2, icons: {} });
    await mount(() => ({ revision: 1, icons: { thr_a: "Star" } }), set);
    await pick("Zap");
    expect(screen.getByTestId("icon").textContent).toBe("Star");
    fireEvent.click(screen.getByText("Pick"));
    fireEvent.click(screen.getByRole("button", { name: "From the title" }));
    await act(async () => {});
    expect(set).toHaveBeenLastCalledWith({ threadId: "thr_a", icon: null });
    expect(screen.getByTestId("icon").textContent).toBe("Bug");
  });

  it("starts from cached picks while the backend answers", async () => {
    stored.set("chat-sidebar/chat-icons", JSON.stringify({ revision: 1, icons: { thr_a: "Star" } }));
    await mount(() => new Promise(() => {}));
    expect(screen.getByTestId("icon").textContent).toBe("Star");
  });

  it("does not load icon settings when project letters are selected", async () => {
    const get = vi.fn();
    await mount(get, undefined, { enabled: false });
    expect(get).not.toHaveBeenCalled();
  });
});
