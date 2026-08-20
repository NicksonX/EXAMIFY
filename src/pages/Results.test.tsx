import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAllSubjects: vi.fn(),
  fetchAttemptHistory: vi.fn(),
  fetchAssessmentResults: vi.fn(),
}));

vi.mock("@/lib/exams", () => ({
  fetchAllSubjects: mocks.fetchAllSubjects,
  fetchAttemptHistory: mocks.fetchAttemptHistory,
}));

vi.mock("@/lib/assessments", () => ({
  fetchAssessmentResults: mocks.fetchAssessmentResults,
}));

import { Results } from "./Results";

const history = {
  rows: [
    {
      id: "attempt-1",
      user_id: "user-1",
      subject_id: "subject-1",
      mode: "full" as const,
      topic_id: null,
      question_count: 40,
      score: 30,
      total: 40,
      percentage: 75,
      grade: "A" as const,
      duration_seconds: 1200,
      questions_snapshot: [],
      answers: {},
      review: [],
      started_at: "2026-08-18T10:00:00.000Z",
      ended_at: "2026-08-18T10:20:00.000Z",
      subject: { name: "Mathematics", slug: "mathematics", category: "secondary" as const, code: "MTH" },
    },
  ],
  total: 1,
  page: 0,
  pageSize: 20,
};

describe("Results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchAllSubjects.mockResolvedValue([]);
    mocks.fetchAttemptHistory.mockResolvedValue(history);
    mocks.fetchAssessmentResults.mockResolvedValue([]);
  });

  it("loads completed history and retries a failed request", async () => {
    mocks.fetchAttemptHistory
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(history);

    render(
      <MemoryRouter initialEntries={["/results"]}>
        <Results />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't load your results");
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => expect(screen.getByText("Mathematics")).toBeInTheDocument());
    expect(mocks.fetchAttemptHistory).toHaveBeenCalledTimes(2);
  });
});
