import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchSecondarySubjects: vi.fn().mockResolvedValue([]),
  fetchInstitutions: vi.fn().mockResolvedValue([
    {
      id: "unilag-id",
      slug: "university-of-lagos",
      name: "University of Lagos",
      type: "university",
      ownership: "federal",
      directory_status: "published",
      catalogue_status: "directory_only",
    },
  ]),
  fetchFaculties: vi.fn(),
  fetchDepartments: vi.fn(),
  fetchDepartmentSubjects: vi.fn(),
}));

vi.mock("@/lib/exams", () => ({
  fetchSecondarySubjects: mocks.fetchSecondarySubjects,
  fetchInstitutions: mocks.fetchInstitutions,
  fetchFaculties: mocks.fetchFaculties,
  fetchDepartments: mocks.fetchDepartments,
  fetchDepartmentSubjects: mocks.fetchDepartmentSubjects,
}));

import { SubjectBrowser } from "./SubjectBrowser";

describe("SubjectBrowser university directory", () => {
  it("does not expose a course cascade for a directory-only university", async () => {
    const user = userEvent.setup();
    render(<SubjectBrowser actions={() => null} />);

    await user.click(screen.getByRole("button", { name: "University directory" }));
    await screen.findByRole("option", { name: "University of Lagos" });
    await user.selectOptions(
      screen.getByLabelText("Nigerian university"),
      "unilag-id",
    );

    expect(await screen.findByRole("status")).toHaveTextContent("Verified institution directory entry");
    expect(screen.getByRole("status")).toHaveTextContent("course catalogue, lessons, and CBT questions have not been published yet");
    expect(screen.queryByLabelText("Faculty")).not.toBeInTheDocument();
    expect(mocks.fetchFaculties).not.toHaveBeenCalled();
  });
});
