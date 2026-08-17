import { describe, expect, it } from "vitest";
import { filterPayoutBanks } from "./wallet";

const banks = [
  { name: "Access Bank", code: "044" },
  { name: "Guaranty Trust Bank", code: "058" },
  { name: "Zenith Bank", code: "057" },
];

describe("filterPayoutBanks", () => {
  it("returns all trusted bank-list entries for an empty search", () => {
    expect(filterPayoutBanks(banks, "  ")).toEqual(banks);
  });

  it("finds Nigerian banks case-insensitively by name or code", () => {
    expect(filterPayoutBanks(banks, "trust")).toEqual([banks[1]]);
    expect(filterPayoutBanks(banks, "057")).toEqual([banks[2]]);
  });

  it("does not manufacture entries for unmatched input", () => {
    expect(filterPayoutBanks(banks, "unknown bank")).toEqual([]);
  });
});
