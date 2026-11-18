import { describe, expect, it } from "vitest";
import { receptionQrSearchSchema } from "./qr-search.contracts";

describe("reception branch URL input", () => {
  it.each([undefined, "", "invalid", 42, ["invalid"]])(
    "treats malformed branch %j as missing instead of throwing",
    (branch) => {
      expect(receptionQrSearchSchema.parse({ branch })).toEqual({ branch: undefined });
    },
  );
  it("preserves a valid selected branch", () => {
    expect(
      receptionQrSearchSchema.parse({ branch: "11111111-1111-4111-8111-111111111111" }),
    ).toEqual({ branch: "11111111-1111-4111-8111-111111111111" });
  });
});
