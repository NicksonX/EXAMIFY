import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: vi.fn(),
    rpc: mocks.rpc,
  },
}));

import { createCheckout, getMyEntitlement } from "./premium";

describe("getMyEntitlement", () => {
  it("preserves exact trial access and expiry fields", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        plan: "pro",
        status: "trial",
        ends_at: "2026-09-02T12:00:00.000Z",
        trial: true,
        trial_ends_at: "2026-09-02T12:00:00.000Z",
        checkout_locked_until: "2026-09-02T12:00:00.000Z",
        completed_exams: 2,
        remaining_exams: null,
        can_take_exam: true,
        can_download_results: true,
        can_read_plus: true,
        can_read_pro: true,
      },
      error: null,
    });

    await expect(getMyEntitlement()).resolves.toMatchObject({
      plan: "pro",
      status: "trial",
      trial: true,
      trialEndsAt: "2026-09-02T12:00:00.000Z",
      checkoutLockedUntil: "2026-09-02T12:00:00.000Z",
      canTakeExam: true,
      canDownloadResults: true,
      canReadPro: true,
    });
  });
});

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

  it("maps the trial checkout lock to safe public copy", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({ error: "TRIAL_CHECKOUT_LOCKED", message: "internal trial details" }),
          { status: 403, headers: { "content-type": "application/json" } },
        ),
      },
    });

    await expect(createCheckout("plus_monthly")).rejects.toMatchObject({
      code: "TRIAL_CHECKOUT_LOCKED",
      message: "Paid plans become available after your 15-day learning trial ends.",
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
