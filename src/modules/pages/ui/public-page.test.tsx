import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { PublicPage } from "./public-page";
import type { PublicPageDto } from "../contracts";
const page: PublicPageDto = {
  companyName: "Glow",
  currency: "KWD",
  services: [
    { id: "92000000-0000-4000-8000-000000000001", name: "Hair", priceMills: "9007199254740993123" },
  ],
  document: {
    blocks: [
      {
        id: "92000000-0000-4000-8000-000000000002",
        type: "hero",
        hidden: false,
        title: { ar: "الصالون", en: "" },
        subtitle: { ar: "<script>alert(1)</script>", en: "" },
      },
      {
        id: "92000000-0000-4000-8000-000000000003",
        type: "services",
        hidden: false,
        showPrices: true,
      },
    ],
  },
};
it("English falls back to Arabic and script strings are literal text", () => {
  render(<PublicPage page={page} lang="en" />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("الصالون");
  expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
  expect(document.querySelector("script")).toBeNull();
});
it("formats bigint mills without floating point", () => {
  render(<PublicPage page={page} lang="ar" />);
  expect(screen.getByText("9007199254740993.123 KWD")).toBeInTheDocument();
});
it("hidden blocks never render", () => {
  render(
    <PublicPage
      page={{
        ...page,
        document: { blocks: page.document.blocks.map((b) => ({ ...b, hidden: true })) },
      }}
      lang="ar"
    />,
  );
  expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
});
