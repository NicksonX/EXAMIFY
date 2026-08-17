import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { createCheckout } from "./premium";

describe("createCheckout", () => {
  it("uses allowlisted checkout errors and keeps an opaque support ID", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({
            error: "PAYMENT_INITIALIZATION_REJECTED",
            message: "provider detail that must not reach the browser",
            requestId: "4d893f90-f03d-4f48-8c9b-7466b8c3839a",
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        ),
      },
    });

    await expect(createCheckout("plus_monthly")).rejects.toMatchObject({
      code: "PAYMENT_INITIALIZATION_REJECTED",
      message: "We could not open Paystack checkout. No payment was started, so you can try again.",
      requestId: "4d893f90-f03d-4f48-8c9b-7466b8c3839a",
    });
  });

  it("does not trust unrecognised server error copy", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        context: {
          clone: () => ({
            json: async () => ({ error: "UNEXPECTED_ERROR", message: "sensitive provider detail" }),
          }),
        },
      },
    });

    await expect(createCheckout("plus_monthly")).rejects.toMatchObject({
      code: "PREMIUM_SERVICE_UNAVAILABLE",
      message: "We couldn't start checkout. Please try again.",
    });
  });

  it("does not expose an internal server message", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({ error: "INTERNAL_ERROR", message: "sensitive provider detail" }),
          { status: 500, headers: { "content-type": "application/json" } },
        ),
      },
    });

    await expect(createCheckout("pro_yearly")).rejects.toMatchObject({
      code: "PREMIUM_SERVICE_UNAVAILABLE",
      message: "We couldn't start checkout. Please try again.",
    });
  });

  it("rejects a checkout response without a trusted HTTPS URL", async () => {
    mocks.invoke.mockResolvedValue({ data: { authorizationUrl: "http://untrusted.test" }, error: null });

    await expect(createCheckout("plus_monthly")).rejects.toMatchObject({
      code: "PREMIUM_INVALID_CHECKOUT",
    });
  });
});
