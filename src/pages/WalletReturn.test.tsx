import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WalletReturn } from "./WalletReturn";

describe("WalletReturn", () => {
  it("keeps legacy callbacks support-oriented without checking or crediting anything", () => {
    render(
      <MemoryRouter initialEntries={["/wallet/return?reference=wlt_1234567890abcdef"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WalletReturn />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "This previous payment is being reconciled." })).toBeInTheDocument();
    expect(screen.getByText("Support reference: wlt_1234567890abcdef")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get help" })).toHaveAttribute("href", "/help");
    expect(screen.queryByRole("button", { name: /check again/i })).not.toBeInTheDocument();
  });
});
