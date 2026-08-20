import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Wallet } from "./Wallet";

describe("Wallet", () => {
  it("shows the non-financial coming-soon experience", () => {
    render(
      <MemoryRouter>
        <Wallet />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "This feature is being prepared." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Go to dashboard/i })).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("button", { name: /deposit|withdraw/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/confirmed available balance/i)).not.toBeInTheDocument();
  });
});
