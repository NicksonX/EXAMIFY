import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn().mockResolvedValue(true),
  getPlanInfo: vi.fn().mockResolvedValue({ plan: "free", trial: false }),
  isFinanceAdmin: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { email: "learner@example.com", user_metadata: {} },
    signOut: mocks.signOut,
  }),
}));
vi.mock("@/context/AccountStateContext", () => ({
  useAccountState: () => ({ accountState: { profile: null } }),
}));
vi.mock("@/lib/accountState", () => ({
  displayIdentity: () => "Learner",
}));
vi.mock("@/lib/premium", () => ({
  getPlanInfo: mocks.getPlanInfo,
  isPremium: () => false,
  planLabel: () => "Free",
}));
vi.mock("@/lib/access", () => ({
  isFinanceAdmin: mocks.isFinanceAdmin,
}));

import { AppShell } from "./AppShell";

describe("AppShell mobile navigation", () => {
  it("opens an in-flow workspace menu and closes it with Escape", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<p>Dashboard content</p>} />
            <Route path="/study" element={<p>Study content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const trigger = screen.getByRole("button", { name: "Toggle workspace navigation" });
    await user.click(trigger);

    const mobileMenu = screen.getByRole("navigation", { name: "Workspace navigation" });
    expect(mobileMenu).toBeInTheDocument();
    expect(within(mobileMenu).getByRole("link", { name: "Wallet Coming soon" })).toHaveAttribute("href", "/wallet");
    expect(within(mobileMenu).queryByRole("link", { name: "Referrals" })).not.toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("navigation", { name: "Workspace navigation" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("labels a server-reported trial as trial access rather than a paid plan", async () => {
    mocks.getPlanInfo.mockResolvedValueOnce({ plan: "pro", trial: true });
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<p>Dashboard content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("15-day learning trial")).toBeInTheDocument();
    expect(screen.getByText("Trial access")).toBeInTheDocument();
    expect(screen.queryByText("Examify Pro")).not.toBeInTheDocument();
  });

  it("returns focus to the desktop account-menu trigger after Escape", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<p>Dashboard content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const trigger = screen.getByRole("button", { name: "Open account menu" });
    await user.click(trigger);
    expect(document.getElementById("account-menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(document.getElementById("account-menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
