// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DebouncedInput } from "../components/folder-editor/controls";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("folder input", () => {
  it.each(["", "0", "-1", "1.5", "8761"])("never saves invalid hours: %s", (value) => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    const view = render(<DebouncedInput label="Hours" type="number" min={1} max={8760} value="24" onCommit={onCommit} />);
    const input = view.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.change(input, { target: { value } });
    vi.advanceTimersByTime(600);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(input.value).toBe("24");
    view.unmount();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it.each(["text", "number"] as const)("saves an uncommitted %s draft on unmount", (type) => {
    const onCommit = vi.fn();
    const view = render(<DebouncedInput label="Value" type={type} value="24" onCommit={onCommit} />);
    fireEvent.change(view.getByLabelText("Value"), { target: { value: "72" } });
    view.unmount();
    expect(onCommit).toHaveBeenCalledWith("72");
  });
});
