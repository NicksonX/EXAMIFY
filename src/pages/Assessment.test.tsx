import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearAssessmentEssayResponse: vi.fn(),
  finalizeAssessmentMedia: vi.fn(),
  requestAssessmentMediaUpload: vi.fn(),
  resumeAssessment: vi.fn(),
  saveAssessmentResponse: vi.fn(),
  startAssessment: vi.fn(),
  submitAssessment: vi.fn(),
}));

vi.mock("@/lib/assessments", () => ({
  AssessmentError: class AssessmentError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  clearAssessmentEssayResponse: mocks.clearAssessmentEssayResponse,
  finalizeAssessmentMedia: mocks.finalizeAssessmentMedia,
  requestAssessmentMediaUpload: mocks.requestAssessmentMediaUpload,
  resumeAssessment: mocks.resumeAssessment,
  saveAssessmentResponse: mocks.saveAssessmentResponse,
  startAssessment: mocks.startAssessment,
  submitAssessment: mocks.submitAssessment,
}));

import { Assessment } from "./Assessment";

const attempt = {
  attempt_id: "attempt-1",
  definition_id: "definition-1",
  purpose: "main" as const,
  assessment_type: "objective" as const,
  status: "in_progress" as const,
  started_at: "2026-08-20T10:00:00.000Z",
  deadline_at: "2099-08-20T11:00:00.000Z",
  submitted_at: null,
  progress_version: 0,
  score: null,
  max_points: 10,
  percentage: null,
  grade: null,
  items: [{
    id: "item-1",
    position: 0,
    item_type: "objective" as const,
    prompt: "What is 2 + 2?",
    options: ["3", "4"],
    max_points: 10,
    required: true,
    response: null,
  }],
};

describe("Assessment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.startAssessment.mockResolvedValue(attempt);
    mocks.resumeAssessment.mockResolvedValue(attempt);
  });

  it("loads an assessment in Strict Mode instead of remaining on the preparation screen", async () => {
    render(
      <MemoryRouter initialEntries={["/assessment/definition-1"]}>
        <Routes><Route path="/assessment/:definitionId" element={<Assessment />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("What is 2 + 2?")).toBeInTheDocument();
    expect(mocks.startAssessment).toHaveBeenCalledWith("definition-1");
  });

  it("resumes a continuation route by attempt ID", async () => {
    render(
      <MemoryRouter initialEntries={["/assessment/attempt/attempt-1"]}>
        <Routes><Route path="/assessment/attempt/:attemptId" element={<Assessment />} /></Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(mocks.resumeAssessment).toHaveBeenCalledWith("attempt-1"));
    expect(await screen.findByText("What is 2 + 2?")).toBeInTheDocument();
  });
});
