import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAssessmentCatalog: vi.fn(),
  fetchOpenAssessmentAttempts: vi.fn(),
}));

vi.mock("@/lib/assessments", () => ({
  fetchAssessmentCatalog: mocks.fetchAssessmentCatalog,
  fetchOpenAssessmentAttempts: mocks.fetchOpenAssessmentAttempts,
}));

import { MainExams } from "./MainExams";

describe("MainExams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchAssessmentCatalog.mockResolvedValue([]);
    mocks.fetchOpenAssessmentAttempts.mockResolvedValue([]);
  });

  it("offers a continuation route for an in-progress main assessment", async () => {
    mocks.fetchOpenAssessmentAttempts.mockResolvedValue([{
      id: "attempt-1",
      definition_id: "definition-1",
      title: "University entrance assessment",
      purpose: "main",
      assessment_type: "mixed",
      status: "in_progress",
      started_at: "2026-08-20T10:00:00.000Z",
      deadline_at: "2099-08-20T11:00:00.000Z",
    }]);

    render(<MemoryRouter><MainExams /></MemoryRouter>);

    const continueLink = await screen.findByRole("link", { name: "Continue" });
    expect(continueLink).toHaveAttribute("href", "/assessment/attempt/attempt-1");
    expect(screen.getByText("University entrance assessment")).toBeInTheDocument();
  });
});
