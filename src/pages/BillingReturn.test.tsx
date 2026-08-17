import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyPaymentReturn: vi.fn(),
}));

vi.mock("@/lib/premium", () => ({
  accessDurationLabel: (days?: number) => days === 365 ? "365-day pass" : "30-day pass",
  planLabel: (plan: string) => plan === "pro" ? "Pro" : plan === "plus" ? "Plus" : "Free",
  planProductLabel: (product: string) => product === "pro_yearly" ? "Pro Yearly" : "Plus Monthly",
  verifyPaymentReturn: mocks.verifyPaymentReturn,
}));

import { BillingReturn } from "./BillingReturn";

function renderReturn(reference = "exf_1234567890abcdef") {
  return render(
    <MemoryRouter initialEntries={[`/billing/return?reference=${reference}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <BillingReturn />
    </MemoryRouter>,
  );
}

describe("BillingReturn", () => {
  beforeEach(() => {
    mocks.verifyPaymentReturn.mockReset();
  });

  it("renders paid only after the server verifies payment", async () => {
    mocks.verifyPaymentReturn.mockResolvedValue({
      status: "paid",
      plan: "plus",
      endsAt: "2026-09-03T12:00:00.000Z",
    });

    renderReturn();

    expect(await screen.findByText("Your Plus pass is active.")).toBeInTheDocument();
    expect(screen.getByText(/until 3 September 2026/i)).toBeInTheDocument();
    expect(mocks.verifyPaymentReturn).toHaveBeenCalledWith("exf_1234567890abcdef");
  });

  it("uses the product duration returned by verified yearly checkout", async () => {
    mocks.verifyPaymentReturn.mockResolvedValue({
      status: "paid",
      plan: "pro",
      product: "pro_yearly",
      accessDays: 365,
      endsAt: "2027-08-09T12:00:00.000Z",
    });

    renderReturn();

    expect(await screen.findByText("Your Pro Yearly pass is active.")).toBeInTheDocument();
    expect(screen.getByText(/365-day pass/i)).toBeInTheDocument();
  });

  it("does not infer success from an invalid callback reference", async () => {
    renderReturn("untrusted-reference");

    expect(await screen.findByText("We couldn't confirm this payment yet.")).toBeInTheDocument();
    expect(screen.getByText(/return link is invalid/i)).toBeInTheDocument();
    expect(mocks.verifyPaymentReturn).not.toHaveBeenCalled();
  });

  it("keeps a pending payment unactivated", async () => {
    mocks.verifyPaymentReturn.mockResolvedValue({ status: "pending" });

    renderReturn();

    expect(await screen.findByText("We're waiting for confirmation.")).toBeInTheDocument();
    expect(screen.getByText(/cannot activate access by itself/i)).toBeInTheDocument();
    expect(screen.queryByText(/pass is active/i)).not.toBeInTheDocument();
  });

  it("shows a failed payment without claiming access changed", async () => {
    mocks.verifyPaymentReturn.mockResolvedValue({ status: "failed" });

    renderReturn();

    expect(await screen.findByText("No access was changed.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to plans" })).toHaveAttribute("href", "/upgrade");
    expect(screen.queryByText(/pass is active/i)).not.toBeInTheDocument();
  });
});
