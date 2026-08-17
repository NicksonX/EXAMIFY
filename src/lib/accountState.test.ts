import { describe, expect, it } from "vitest";
import { accountStateFrom } from "./accountState";

describe("accountStateFrom", () => {
  it("preserves the explicit Terms availability signal", () => {
    expect(accountStateFrom({
      termsAvailable: false,
      termsRequired: true,
      profileComplete: false,
    })).toMatchObject({
      termsAvailable: false,
      termsRequired: true,
      profileComplete: false,
    });

    expect(accountStateFrom({
      terms_available: true,
      terms_required: false,
      profile_complete: true,
    })).toMatchObject({
      termsAvailable: true,
      termsRequired: false,
      profileComplete: true,
    });
  });
});
