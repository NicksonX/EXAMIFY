import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCheckout: vi.fn(),
  fetchPlans: vi.fn(),
  getMyEntitlement: vi.fn(),
  getMyOpenPaymentCheckout: vi.fn(),
  resumePaymentCheckout: vi.fn(),
}));

vi.mock("@/lib/premium", () => ({
  accessDurationLabel: (days?: number) => days === 365 ? "365-day pass" : "30-day pass",
  createCheckout: mocks.createCheckout,
  fetchPlans: mocks.fetchPlans,
  formatNaira: (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG")}`,
  getMyEntitlement: mocks.getMyEntitlement,
  getMyOpenPaymentCheckout: mocks.getMyOpenPaymentCheckout,
  isPaidPlanSlug: (value: string) => ["plus_monthly", "plus_yearly", "pro_monthly", "pro_yearly"].includes(value),
  planLabel: (plan: string) => plan === "pro" ? "Pro" : plan === "plus" ? "Plus" : "Free",
  planProductLabel: (product: string) => ({
    plus_monthly: "Plus Monthly",
    plus_yearly: "Plus Yearly",
    pro_monthly: "Pro Monthly",
    pro_yearly: "Pro Yearly",
  })[product] ?? product,
  resumePaymentCheckout: mocks.resumePaymentCheckout,
}));

import { Upgrade } from "./Upgrade";

const plans = [
  {
    id: "free", slug: "free", name: "Free", price_kobo: 0, interval: "free", tier: null,
    access_days: null, tagline: null, features: ["Sample material"], highlighted: false, active: true, sort_order: 1,
  },
  {
    id: "plus-monthly", slug: "plus_monthly", name: "Plus Monthly", price_kobo: 500000, interval: "monthly", tier: "plus",
    access_days: 30, tagline: null, features: ["Plus material"], highlighted: false, active: true, sort_order: 2,
  },
] as const;

function renderUpgrade() {
  return render(<MemoryRouter><Upgrade /></MemoryRouter>);
}

describe("Upgrade", () => {
  beforeEach(() => {
    mocks.fetchPlans.mockReset().mockResolvedValue(plans);
    mocks.getMyEntitlement.mockReset().mockResolvedValue({
      plan: "free", status: "active", endsAt: null, completedExams: 0, remainingExams: 0,
      canTakeExam: true, canDownloadResults: false, canReadPlus: false, canReadPro: false,
    });
    mocks.getMyOpenPaymentCheckout.mockReset().mockResolvedValue(null);
    mocks.createCheckout.mockReset();
    mocks.resumePaymentCheckout.mockReset();
  });

  it("disables paid actions during the server-owned learning trial", async () => {
    mocks.getMyEntitlement.mockResolvedValue({
      plan: "pro", status: "trial", endsAt: "2026-09-02T12:00:00.000Z",
      trial: true, trialEndsAt: "2026-09-02T12:00:00.000Z",
      checkoutLockedUntil: "2026-09-02T12:00:00.000Z",
      completedExams: 0, remainingExams: null, canTakeExam: true,
      canDownloadResults: true, canReadPlus: true, canReadPro: true,
    });
    const user = userEvent.setup();
    renderUpgrade();

    const button = await screen.findByRole("button", { name: "Available after trial" });
    expect(button).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Paid plans are unavailable during your learning trial");
    expect(screen.getByRole("status")).toHaveTextContent("2 September 2026");
    await user.click(button);
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });

  it("keeps purchase actions available after a terminal Paystack initialization rejection", async () => {
    mocks.createCheckout.mockRejectedValue(Object.assign(
      new Error("We could not open Paystack checkout. No payment was started, so you can try again."),
      { requestId: "4d893f90-f03d-4f48-8c9b-7466b8c3839a" },
    ));
    const user = userEvent.setup();
    renderUpgrade();

    const button = await screen.findByRole("button", { name: "Choose Plus Monthly" });
    await user.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent("No payment was started");
    expect(screen.getByRole("alert")).toHaveTextContent("Support ID: 4d893f90-f03d-4f48-8c9b-7466b8c3839a");
    expect(screen.getByRole("button", { name: "Choose Plus Monthly" })).toBeEnabled();
    expect(screen.queryByText(/checkout is still open/i)).not.toBeInTheDocument();
  });

  it("does not resume an initialized checkout during the learning trial", async () => {
    mocks.getMyEntitlement.mockResolvedValue({
      plan: "pro", status: "trial", endsAt: "2026-09-02T12:00:00.000Z",
      trial: true, trialEndsAt: "2026-09-02T12:00:00.000Z",
      checkoutLockedUntil: "2026-09-02T12:00:00.000Z",
      completedExams: 0, remainingExams: null, canTakeExam: true,
      canDownloadResults: true, canReadPlus: true, canReadPro: true,
    });
    mocks.getMyOpenPaymentCheckout.mockResolvedValue({
      product: "pro_yearly", tier: "pro", reference: "exf_1234567890abcdef", status: "initialized", expiresAt: "2026-08-12T12:30:00.000Z",
    });
    renderUpgrade();

    expect(await screen.findByText(/A Pro Yearly checkout is still open/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume checkout" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Check payment status" })).toBeInTheDocument();
  });

  it("shows resume only for an initialized checkout", async () => {
    mocks.getMyOpenPaymentCheckout.mockResolvedValue({
      product: "pro_yearly", tier: "pro", reference: "exf_1234567890abcdef", status: "initialized", expiresAt: "2026-08-12T12:30:00.000Z",
    });
    renderUpgrade();

    expect(await screen.findByRole("button", { name: "Resume checkout" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Checkout open for Pro Yearly/i })).toBeDisabled();
  });

  it("withholds resume for a reconciling checkout", async () => {
    mocks.getMyOpenPaymentCheckout.mockResolvedValue({
      product: "pro_yearly", tier: "pro", reference: "exf_1234567890abcdef", status: "reconciling", expiresAt: "2026-08-12T12:30:00.000Z",
    });
    renderUpgrade();

    expect(await screen.findByText(/safely checking this checkout/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume checkout" })).not.toBeInTheDocument();
  });
});
