import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancelManualPayoutRequest: vi.fn(),
  getManualPayoutBanks: vi.fn(),
  getMyManualPayoutRequestByClientRequestId: vi.fn(),
  getMyManualPayoutRequests: vi.fn(),
  getWithdrawalPinStatus: vi.fn(),
  isManualPayoutSubmissionUnconfirmed: vi.fn(),
  requestManualPayout: vi.fn(),
  setWithdrawalPin: vi.fn(),
}));

vi.mock("@/lib/wallet", () => ({
  cancelManualPayoutRequest: mocks.cancelManualPayoutRequest,
  filterPayoutBanks: (banks: { code: string; name: string }[], search: string) => {
    const query = search.trim().toLowerCase();
    return query
      ? banks.filter((bank) => `${bank.code} ${bank.name}`.toLowerCase().includes(query))
      : banks;
  },
  getManualPayoutBanks: mocks.getManualPayoutBanks,
  getMyManualPayoutRequestByClientRequestId: mocks.getMyManualPayoutRequestByClientRequestId,
  getMyManualPayoutRequests: mocks.getMyManualPayoutRequests,
  getWithdrawalPinStatus: mocks.getWithdrawalPinStatus,
  isManualPayoutSubmissionUnconfirmed: mocks.isManualPayoutSubmissionUnconfirmed,
  requestManualPayout: mocks.requestManualPayout,
  setWithdrawalPin: mocks.setWithdrawalPin,
}));

import { ManualPayoutCard } from "./ManualPayoutCard";

const settings = {
  withdrawalsEnabled: true,
  manualPayoutRequestsEnabled: true,
  minimumWithdrawalKobo: 50_000,
} as Parameters<typeof ManualPayoutCard>[0]["settings"];

const wallet = {
  availableBalanceKobo: 150_000,
} as Parameters<typeof ManualPayoutCard>[0]["wallet"];

async function completeDetails(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("option", { name: "Guaranty Trust Bank" });
  await user.selectOptions(screen.getByLabelText("Bank"), "058");
  await user.type(screen.getByLabelText("10-digit account number"), "0123456789");
  await user.type(screen.getByLabelText("Account holder name"), "Ada Okafor");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByLabelText("Amount (₦)"), "1000");
  expect(screen.getByLabelText("Amount (₦)")).toHaveValue("1,000");
  await user.click(screen.getByRole("button", { name: "Review withdrawal" }));
  await user.click(screen.getByLabelText(/I have double-checked these details/i));
  await user.click(screen.getByRole("button", { name: "Continue to PIN" }));
}

describe("ManualPayoutCard", () => {
  beforeEach(() => {
    mocks.getManualPayoutBanks.mockReset().mockResolvedValue([{ code: "058", name: "Guaranty Trust Bank" }]);
    mocks.getMyManualPayoutRequestByClientRequestId.mockReset().mockResolvedValue(null);
    mocks.getMyManualPayoutRequests.mockReset().mockResolvedValue([]);
    mocks.getWithdrawalPinStatus.mockReset().mockResolvedValue(true);
    mocks.isManualPayoutSubmissionUnconfirmed.mockReset().mockReturnValue(false);
    mocks.requestManualPayout.mockReset().mockResolvedValue({ requestId: "request-1" });
    mocks.setWithdrawalPin.mockReset().mockResolvedValue(undefined);
  });

  it("requires a double-check acknowledgement before submitting learner-entered bank details", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const onSubmissionConfirmed = vi.fn();
    render(<ManualPayoutCard settings={settings} wallet={wallet} onChanged={onChanged} onSubmissionConfirmed={onSubmissionConfirmed} />);

    await screen.findByRole("option", { name: "Guaranty Trust Bank" });
    await user.selectOptions(screen.getByLabelText("Bank"), "058");
    await user.type(screen.getByLabelText("10-digit account number"), "0123456789");
    await user.type(screen.getByLabelText("Account holder name"), "Ada Okafor");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(screen.getByLabelText("Amount (₦)"), "1000");
    await user.click(screen.getByRole("button", { name: "Review withdrawal" }));

    expect(screen.getByText(/This name was entered by you, not verified automatically/i)).toBeInTheDocument();
    const continueToPin = screen.getByRole("button", { name: "Continue to PIN" });
    expect(continueToPin).toBeDisabled();

    await user.click(screen.getByLabelText(/I have double-checked these details/i));
    await user.click(continueToPin);
    await screen.findByText(/Enter transaction PIN/i);
    await user.type(screen.getByLabelText("Six-digit transaction PIN"), "246810");
    await user.click(screen.getByRole("button", { name: "Submit withdrawal request" }));

    expect(mocks.requestManualPayout).toHaveBeenCalledWith(expect.objectContaining({
      bankCode: "058",
      accountNumber: "0123456789",
      accountHolderName: "Ada Okafor",
      amountKobo: 100_000,
      pin: "246810",
      clientRequestId: expect.any(String),
    }));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onSubmissionConfirmed).toHaveBeenCalledWith({
      requestId: "request-1",
      amountKobo: 100_000,
      bankName: "Guaranty Trust Bank",
      accountNumberMasked: "******6789",
      recovered: false,
    });
  });

  it("requires matching six-digit PIN entries before initial PIN setup", async () => {
    mocks.getWithdrawalPinStatus.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<ManualPayoutCard settings={settings} wallet={wallet} onChanged={vi.fn()} />);

    await completeDetails(user);
    await screen.findByText(/Create transaction PIN/i);
    const createdPin = screen.getByLabelText("Create six-digit transaction PIN");
    expect(createdPin).toHaveAttribute("type", "password");
    await user.click(screen.getAllByRole("button", { name: "Show PIN" })[0]);
    expect(createdPin).toHaveAttribute("type", "text");
    await user.type(createdPin, "246810");
    await user.type(screen.getByLabelText("Confirm transaction PIN"), "135790");
    await user.click(screen.getByRole("button", { name: "Save PIN" }));

    expect(screen.getByText(/entries do not match/i)).toBeInTheDocument();
    expect(mocks.setWithdrawalPin).not.toHaveBeenCalled();
  });

  it("reconciles an unconfirmed submission using the original request identifier", async () => {
    mocks.requestManualPayout.mockRejectedValue(new Error("lost response"));
    mocks.isManualPayoutSubmissionUnconfirmed.mockReturnValue(true);
    mocks.getMyManualPayoutRequestByClientRequestId.mockResolvedValue({
      id: "request-1", amountKobo: 100_000, status: "requested", bankName: "Guaranty Trust Bank",
      accountHolderName: "Ada Okafor", accountNumberMasked: "******6789", requestedAt: "2026-08-05T00:00:00.000Z",
      reviewReason: null, completedAt: null,
    });
    const user = userEvent.setup();
    const onSubmissionConfirmed = vi.fn();
    render(<ManualPayoutCard settings={settings} wallet={wallet} onChanged={vi.fn()} onSubmissionConfirmed={onSubmissionConfirmed} />);

    await completeDetails(user);
    await user.type(screen.getByLabelText("Six-digit transaction PIN"), "246810");
    await user.click(screen.getByRole("button", { name: "Submit withdrawal request" }));

    expect(mocks.getMyManualPayoutRequestByClientRequestId).toHaveBeenCalledWith(expect.any(String));
    expect(onSubmissionConfirmed).toHaveBeenCalledWith({
      requestId: "request-1",
      amountKobo: 100_000,
      bankName: "Guaranty Trust Bank",
      accountNumberMasked: "******6789",
      recovered: true,
    });
  });

  it("does not report a success callback for an unresolved submission", async () => {
    mocks.requestManualPayout.mockRejectedValue(new Error("lost response"));
    mocks.isManualPayoutSubmissionUnconfirmed.mockReturnValue(true);
    const user = userEvent.setup();
    const onSubmissionConfirmed = vi.fn();
    render(<ManualPayoutCard settings={settings} wallet={wallet} onChanged={vi.fn()} onSubmissionConfirmed={onSubmissionConfirmed} />);

    await completeDetails(user);
    await user.type(screen.getByLabelText("Six-digit transaction PIN"), "246810");
    await user.click(screen.getByRole("button", { name: "Submit withdrawal request" }));

    expect(await screen.findByText(/could not confirm whether this withdrawal request was received/i)).toBeInTheDocument();
    expect(onSubmissionConfirmed).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Check request status" })).toBeInTheDocument();
  });

  it("keeps the withdrawal unavailable when the manual release flag is off", () => {
    render(<ManualPayoutCard settings={{ ...settings, manualPayoutRequestsEnabled: false } as Parameters<typeof ManualPayoutCard>[0]["settings"]} wallet={wallet} onChanged={vi.fn()} />);

    expect(screen.getByText(/Bank withdrawals are temporarily unavailable/i)).toBeInTheDocument();
    expect(mocks.getManualPayoutBanks).not.toHaveBeenCalled();
  });
});
