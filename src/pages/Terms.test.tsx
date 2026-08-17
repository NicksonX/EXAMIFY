import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acceptCurrentTerms: vi.fn(),
  rpc: vi.fn(),
  useAccountState: vi.fn(),
}));

vi.mock("@/context/AccountStateContext", () => ({
  useAccountState: mocks.useAccountState,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc },
}));

import { Terms } from "./Terms";

function renderTerms() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Terms acceptanceRequired />
    </MemoryRouter>,
  );
}

describe("Terms", () => {
  beforeEach(() => {
    mocks.acceptCurrentTerms.mockReset();
    mocks.rpc.mockReset();
    mocks.useAccountState.mockReset();
  });

  it("shows a clear unavailable state without retrying or accepting Terms", () => {
    mocks.useAccountState.mockReturnValue({
      accountState: {
        termsAvailable: false,
        termsRequired: true,
        profileComplete: false,
        profile: null,
        terms: null,
      },
      acceptCurrentTerms: mocks.acceptCurrentTerms,
    });

    renderTerms();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Terms are not currently published.",
    );
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept and continue" })).toBeDisabled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
