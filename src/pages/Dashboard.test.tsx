import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAttemptStats: vi.fn().mockResolvedValue({ totalQuestions: 0, bestPercentage: 0, completedCount: 0 }),
  fetchRecentAttempts: vi.fn().mockResolvedValue([]),
  getPlanInfo: vi.fn().mockResolvedValue({
    plan: "pro",
    status: "trial",
    endsAt: "2026-09-02T12:00:00.000Z",
    trial: true,
    trialEndsAt: "2026-09-02T12:00:00.000Z",
    checkoutLockedUntil: "2026-09-02T12:00:00.000Z",
    completedExams: 0,
    remainingExams: null,
    canTakeExam: true,
    canDownloadResults: true,
    canReadPlus: true,
    canReadPro: true,
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { user_metadata: { full_name: "Learner" } } }),
}));
vi.mock("@/context/AccountStateContext", () => ({
  useAccountState: () => ({ accountState: { profile: null } }),
}));
vi.mock("@/lib/accountState", () => ({
  displayIdentity: () => "Learner",
}));
vi.mock("@/lib/exams", () => ({
  fetchAttemptStats: mocks.fetchAttemptStats,
  fetchRecentAttempts: mocks.fetchRecentAttempts,
}));
vi.mock("@/lib/premium", () => ({
  getPlanInfo: mocks.getPlanInfo,
  gradeStyle: () => ({ text: "", bg: "", ring: "" }),
  planLabel: (plan: string) => plan === "pro" ? "Pro" : plan === "plus" ? "Plus" : "Free",
  remarkForGrade: () => "Awaiting result",
}));
vi.mock("@/components/SubjectBrowser", () => ({
  SubjectBrowser: () => <div>Subject browser</div>,
}));

import { Dashboard } from "./Dashboard";

describe("Dashboard trial presentation", () => {
  it("does not present server-granted trial capabilities as a paid Pro plan", async () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "15-day learning trial" })).toBeInTheDocument();
    expect(screen.getByText("Trial access")).toBeInTheDocument();
    expect(screen.getByText("Current access")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View trial details/i })).toHaveAttribute("href", "/upgrade");
    expect(screen.queryByText("Examify Pro")).not.toBeInTheDocument();
  });
});
