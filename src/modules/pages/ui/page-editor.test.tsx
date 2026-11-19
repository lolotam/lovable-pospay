import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { usePageEditor, type PageEditorActions } from "./use-page-editor";
import type { PageDraftDto } from "../contracts";
import { render } from "@testing-library/react";
import { SlugField } from "./slug-field";
const initial: PageDraftDto = {
  slug: "glow-salon",
  document: { blocks: [] },
  version: 1,
  publishedAt: null,
  companyName: "Glow",
  currency: "KWD",
  services: [],
};
function actions(): PageEditorActions {
  return {
    save: vi.fn(async (input) => ({ ...initial, ...input, version: 2 })),
    publish: vi.fn(async () => ({ ...initial, version: 3 })),
    unpublish: vi.fn(async () => initial),
    reload: vi.fn(async () => initial),
    check: vi.fn(async () => true),
  };
}
it("add, reorder, hide and delete update the editor document", () => {
  const { result } = renderHook(() => usePageEditor(initial, actions()));
  act(() => {
    result.current.setValid(true);
    result.current.add("hero");
  });
  const first = result.current.document.blocks[0];
  if (!first) throw new Error("Missing hero");
  expect(result.current.canPublish).toBe(true);
  act(() => result.current.add("about"));
  const second = result.current.document.blocks[1];
  if (!second) throw new Error("Missing about");
  act(() => result.current.move(second.id, -1));
  expect(result.current.document.blocks.map((b) => b.type)).toEqual(["about", "hero"]);
  act(() => {
    result.current.toggle(first.id);
    result.current.toggle(second.id);
  });
  expect(result.current.canPublish).toBe(false);
  act(() => result.current.remove(first.id));
  expect(result.current.document.blocks).toHaveLength(1);
});
it("publishes newly saved draft using the returned version", async () => {
  const api = actions();
  const { result } = renderHook(() => usePageEditor(initial, api));
  act(() => result.current.add("hero"));
  await act(async () => result.current.execute("publish"));
  expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }));
  expect(api.publish).toHaveBeenCalledWith(2);
});
it("PAGE_CONFLICT reloads the latest draft without retrying the write", async () => {
  const api = actions();
  api.save = vi.fn(async () => {
    throw new Error("PAGE_CONFLICT");
  });
  api.reload = vi.fn(async () => ({ ...initial, version: 9, slug: "latest-page" }));
  const { result } = renderHook(() => usePageEditor(initial, api));
  act(() => result.current.setSlug("edited-page"));
  await act(async () => result.current.execute("save"));
  expect(result.current.draft.version).toBe(9);
  expect(result.current.slug).toBe("latest-page");
  expect(result.current.message).toBe("pages.conflict");
  expect(api.save).toHaveBeenCalledTimes(1);
});
it("availability uses only the latest slug after the debounce", async () => {
  const check = vi.fn(async () => true),
    valid = vi.fn();
  const { rerender } = render(
    <SlugField value="glow-salon" onChange={() => {}} check={check} onValidity={valid} />,
  );
  rerender(<SlugField value="glow-other" onChange={() => {}} check={check} onValidity={valid} />);
  await waitFor(() => expect(valid).toHaveBeenLastCalledWith(true));
  expect(check).toHaveBeenCalledExactlyOnceWith("glow-other");
});
