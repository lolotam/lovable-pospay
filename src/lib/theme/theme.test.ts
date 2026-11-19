import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { THEME_BOOT_SCRIPT, THEME_COLORS, THEME_STORAGE_KEY, applyTheme } from "./theme";

function themeColors() {
  return [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) =>
    meta.getAttribute("content"),
  );
}

beforeEach(() => {
  document.head.innerHTML = `
    <meta name="theme-color" content="${THEME_COLORS.light}" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="${THEME_COLORS.dark}" media="(prefers-color-scheme: dark)">`;
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("browser theme color", () => {
  it.each(["light", "dark"] as const)("a %s theme picked by hand colors both metas", (theme) => {
    applyTheme(theme);
    expect(themeColors()).toEqual([THEME_COLORS[theme], THEME_COLORS[theme]]);
  });

  it("the boot script restores a stored dark theme before paint", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    new Function(THEME_BOOT_SCRIPT)();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(themeColors()).toEqual([THEME_COLORS.dark, THEME_COLORS.dark]);
  });

  it("without a stored theme the metas keep following the system setting", () => {
    new Function(THEME_BOOT_SCRIPT)();
    expect(themeColors()).toEqual([THEME_COLORS.light, THEME_COLORS.dark]);
  });
});
