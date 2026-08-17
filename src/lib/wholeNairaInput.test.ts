import { describe, expect, it } from "vitest";
import { formatWholeNairaInput, wholeNairaInputToKobo } from "./wholeNairaInput";

describe("whole-naira input", () => {
  it("groups whole-naira amounts and retains exact kobo values", () => {
    expect(formatWholeNairaInput("1000")).toBe("1,000");
    expect(formatWholeNairaInput("25,000")).toBe("25,000");
    expect(formatWholeNairaInput("150000")).toBe("150,000");
    expect(formatWholeNairaInput("₦1,250,000")).toBe("1,250,000");
    expect(wholeNairaInputToKobo("1,250,000")).toBe(125_000_000);
  });

  it("rejects fractional, signed, exponential, and unsafe values", () => {
    expect(formatWholeNairaInput("1.50")).toBeNull();
    expect(formatWholeNairaInput("-1000")).toBeNull();
    expect(formatWholeNairaInput("1e6")).toBeNull();
    expect(wholeNairaInputToKobo("9007199254740992")).toBeNull();
  });
});
