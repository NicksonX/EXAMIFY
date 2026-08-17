import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Referrals } from "./Referrals";

describe("Referrals", () => {
  it("keeps the legacy URL away from the retired referral flow", () => {
    render(
      <MemoryRouter
        initialEntries={["/referrals"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/referrals" element={<Referrals />} />
          <Route path="/wallet" element={<p>Wallet placeholder</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Wallet placeholder")).toBeInTheDocument();
  });
});
