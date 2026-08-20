import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchSubject: vi.fn(),
  fetchTopics: vi.fn(),
  listOpenExamAttempts: vi.fn(),
}));

vi.mock("@/lib/exams", () => ({
  fetchSubject: mocks.fetchSubject,
  fetchTopics: mocks.fetchTopics,
  listOpenExamAttempts: mocks.listOpenExamAttempts,
}));

vi.mock("@/components/SubjectBrowser", () => ({
  SubjectBrowser: () => <div data-testid="subject-browser" />,
}));

import { Practice } from "./Practice";

const subject = {
  id: "subject-1",
  slug: "mathematics",
  name: "Mathematics",
  category: "secondary" as const,
  exam_family: "jamb" as const,
  department_id: null,
  level: null,
  code: "MTH",
  blurb: "Core mathematics",
  sort_order: 1,
};

describe("Practice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchSubject.mockResolvedValue(subject);
    mocks.fetchTopics.mockResolvedValue([]);
    mocks.listOpenExamAttempts.mockResolvedValue([]);
  });

  it("loads and preserves a dashboard subject deep link", async () => {
    render(
      <MemoryRouter initialEntries={["/practice?subject_id=subject-1"]}>
        <Practice />
      </MemoryRouter>,
    );

    expect(screen.getByText("Loading selected subject...")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Mathematics")).toBeInTheDocument());

    expect(mocks.fetchSubject).toHaveBeenCalledWith("subject-1");
    expect(screen.getByRole("link", { name: /start full exam/i })).toHaveAttribute(
      "href",
      "/exam?subject_id=subject-1&mode=full&count=40",
    );
  });

  it("shows resumable protocol attempts without creating another attempt", async () => {
    mocks.listOpenExamAttempts.mockResolvedValue([
      {
        attempt_id: "attempt-1",
        subject_id: "subject-1",
        subject_name: "Mathematics",
        mode: "topic",
        topic_id: "topic-1",
        question_count: 20,
        current_question_index: 4,
        progress_version: 4,
        started_at: "2026-08-18T10:00:00.000Z",
        deadline_at: "2026-08-18T11:00:00.000Z",
        expired: false,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/practice"]}>
        <Practice />
      </MemoryRouter>,
    );

    const resume = await screen.findByRole("link", { name: /resume/i });
    expect(resume).toHaveAttribute(
      "href",
      "/exam?subject_id=subject-1&mode=topic&topic_id=topic-1",
    );
    expect(mocks.listOpenExamAttempts).toHaveBeenCalledTimes(1);
    expect(mocks.fetchSubject).not.toHaveBeenCalled();
  });
});
