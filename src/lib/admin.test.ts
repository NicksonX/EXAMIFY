import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc },
}));

import adminSource from "./admin.ts?raw";
import { getAdminManualPayoutRequests } from "./admin";

describe("finance archive client", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  it("maps only the minimal read-only reconciliation projection", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          id: "request-1",
          user_id: "learner-1",
          user_email: "learner@example.com",
          amount_kobo: 125_000,
          status: "requested",
          requested_at: "2026-08-05T10:00:00.000Z",
          account_number_ciphertext: "must-not-be-projected",
          account_number_masked: "******6789",
        },
        { id: "incomplete" },
      ],
      error: null,
    });

    await expect(getAdminManualPayoutRequests()).resolves.toEqual([
      {
        id: "request-1",
        userId: "learner-1",
        userEmail: "learner@example.com",
        amountKobo: 125_000,
        status: "requested",
        requestedAt: "2026-08-05T10:00:00.000Z",
      },
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith("get_finance_admin_manual_payout_queue");
  });

  it("contains no browser approval, claim, or payment-decision procedure", () => {
    expect(adminSource).not.toMatch(/claim(?:Manual|Paystack)PayoutReview/);
    expect(adminSource).not.toMatch(/review(?:Manual|Paystack)Payout/);
    expect(adminSource).not.toMatch(/reviewReferralTransfer/);
    expect(adminSource).not.toMatch(/resolve_(?:manual|paystack)_payout_review/);
    expect(adminSource).not.toMatch(/resolve_referral_transfer_review/);
  });
});
