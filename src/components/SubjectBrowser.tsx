import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Building2, GraduationCap, Layers, Loader2, ChevronDown } from "lucide-react";
import {
  fetchDepartmentSubjects,
  fetchDepartments,
  fetchFaculties,
  fetchInstitutions,
  fetchSecondarySubjects,
  type Department,
  type Faculty,
  type Institution,
  type Subject,
} from "@/lib/exams";

type Tab = "secondary" | "university";

interface SubjectBrowserProps {
  /** Per-subject action node (buttons, links). */
  actions: (subject: Subject) => ReactNode;
  /** Optional heading rendered above the grid. */
  heading?: string;
  /** Keeps catalogue controls aligned with their host section. */
  variant?: "workspace" | "editorial";
}

export function SubjectBrowser({ actions, heading, variant = "workspace" }: SubjectBrowserProps) {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<Tab>("secondary");

  // Secondary subjects.
  const [secondary, setSecondary] = useState<Subject[]>([]);
  const [loadingSec, setLoadingSec] = useState(true);
  const [secError, setSecError] = useState(false);

  // University cascade.
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [courses, setCourses] = useState<Subject[]>([]);

  const [institutionId, setInstitutionId] = useState("");
  const [institutionSearch, setInstitutionSearch] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  const [loadingFac, setLoadingFac] = useState(false);
  const [loadingDept, setLoadingDept] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [univError, setUnivError] = useState(false);
  const selectedInstitution = institutions.find((institution) => institution.id === institutionId) ?? null;
  const cataloguePublished = selectedInstitution?.catalogue_status === "catalogue_published";
  const directoryInstitutions = institutions.filter((institution) => {
    const query = institutionSearch.trim().toLocaleLowerCase();
    return !query || `${institution.name} ${institution.ownership ?? ""}`.toLocaleLowerCase().includes(query);
  });

  // Load secondary subjects and the verified university directory up front.
  useEffect(() => {
    let active = true;
    setLoadingSec(true);
    setSecError(false);
    setUnivError(false);
    void (async () => {
      const [secondaryResult, directoryResult] = await Promise.allSettled([
        fetchSecondarySubjects(),
        fetchInstitutions(),
      ]);
      if (!active) return;

      if (secondaryResult.status === "fulfilled") setSecondary(secondaryResult.value);
      else setSecError(true);

      if (directoryResult.status === "fulfilled") setInstitutions(directoryResult.value);
      else setUnivError(true);

      setLoadingSec(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Load faculties only for an independently published catalogue.
  useEffect(() => {
    if (!institutionId || !cataloguePublished) {
      setFaculties([]);
      setFacultyId("");
      setDepartmentId("");
      setDepartments([]);
      setCourses([]);
      return;
    }
    let active = true;
    setLoadingFac(true);
    setFacultyId("");
    setDepartmentId("");
    setDepartments([]);
    setCourses([]);
    void (async () => {
      try {
        const f = await fetchFaculties(institutionId);
        if (active) setFaculties(f);
      } catch {
        if (active) setUnivError(true);
      } finally {
        if (active) setLoadingFac(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [institutionId, cataloguePublished]);

  // Load departments when a faculty is chosen.
  useEffect(() => {
    if (!facultyId) {
      setDepartments([]);
      return;
    }
    let active = true;
    setLoadingDept(true);
    setDepartmentId("");
    setCourses([]);
    void (async () => {
      try {
        const d = await fetchDepartments(facultyId);
        if (active) setDepartments(d);
      } catch {
        if (active) setUnivError(true);
      } finally {
        if (active) setLoadingDept(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [facultyId]);

  // Load courses when a department is chosen.
  useEffect(() => {
    if (!departmentId) {
      setCourses([]);
      return;
    }
    let active = true;
    setLoadingCourses(true);
    void (async () => {
      try {
        const c = await fetchDepartmentSubjects(departmentId);
        if (active) setCourses(c);
      } catch {
        if (active) setUnivError(true);
      } finally {
        if (active) setLoadingCourses(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [departmentId]);

  // Group university courses by level.
  const levelGroups = groupByLevel(courses);

  return (
    <div className={`subject-browser ${variant === "editorial" ? "editorial-subject-browser" : "subject-browser-workspace"}`}>
      {heading ? (
        <h2 className={variant === "editorial" ? "font-editorial-display text-3xl font-semibold tracking-[-0.055em] text-[#14274a]" : "font-display text-xl font-bold tracking-tight text-ink"}>
          {heading}
        </h2>
      ) : null}

      {/* Category tabs */}
      <div className={`subject-tabs mt-4 inline-flex border p-1 ${variant === "editorial" ? "rounded-[2px] border-[#14274a]/15 bg-[#fffdfa]/60" : "rounded-xl border-line bg-canvas"}`}>
        <TabButton variant={variant} active={tab === "secondary"} onClick={() => setTab("secondary")}>
          <GraduationCap size={15} /> Secondary
        </TabButton>
        <TabButton variant={variant} active={tab === "university"} onClick={() => setTab("university")}>
          <Building2 size={15} /> University directory
        </TabButton>
      </div>

      {/* Secondary */}
      {tab === "secondary" ? (
        <div className="mt-6">
          {loadingSec ? (
            <Spinner label="Loading subjects..." />
          ) : secError ? (
            <ErrorNote text="We couldn't load subjects. Please refresh to try again." />
          ) : secondary.length === 0 ? (
            <EmptyNote text="Secondary subjects will appear here once published." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {secondary.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.2) }}
                >
                  <SubjectCard subject={s}>{actions(s)}</SubjectCard>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* University */}
      {tab === "university" ? (
        <div className="mt-6">
          {univError ? (
            <ErrorNote text="We couldn't load the university catalogue. Please refresh to try again." />
          ) : null}

          {institutions.length === 0 && !univError ? (
            <EmptyNote text="No verified university entries are published yet. An administrator must approve the imported NUC directory batches before they appear here." />
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-lighter">Search Nigerian universities</span>
                <input
                  type="search"
                  value={institutionSearch}
                  onChange={(event) => setInstitutionSearch(event.target.value)}
                  placeholder="Search by university or ownership"
                  className="field-control mt-1.5"
                />
              </label>
              <p className="text-xs text-ink-lighter">{directoryInstitutions.length} of {institutions.length} verified universities shown</p>
              <SelectField
                label="Nigerian university"
                value={institutionId}
                onChange={setInstitutionId}
                placeholder={directoryInstitutions.length ? "Select a verified university" : "No matching university"}
                options={directoryInstitutions.map((x) => ({ value: x.id, label: x.name }))}
              />

              {selectedInstitution && !cataloguePublished ? (
                <div className="border-y border-dashed border-line px-5 py-8" role="status">
                  <p className="font-semibold text-ink">Verified institution directory entry</p>
                  <p className="mt-2 text-sm leading-6 text-ink-soft">
                    This university is listed in the current NUC directory. Its Examify course catalogue, lessons, and CBT questions have not been published yet.
                  </p>
                </div>
              ) : selectedInstitution ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField
                      label="Faculty"
                      value={facultyId}
                      onChange={setFacultyId}
                      placeholder="Select faculty"
                      disabled={loadingFac}
                      loading={loadingFac}
                      options={faculties.map((x) => ({ value: x.id, label: x.name }))}
                    />
                    <SelectField
                      label="Department"
                      value={departmentId}
                      onChange={setDepartmentId}
                      placeholder={facultyId ? "Select department" : "Choose faculty first"}
                      disabled={!facultyId || loadingDept}
                      loading={loadingDept}
                      options={departments.map((x) => ({ value: x.id, label: x.name }))}
                    />
                  </div>

                  {departmentId ? (
                    loadingCourses ? (
                      <Spinner label="Loading courses..." />
                    ) : courses.length === 0 ? (
                      <EmptyNote text="No courses found for this department yet." />
                    ) : (
                      <div className="space-y-6">
                        {levelGroups.map((group) => (
                          <div key={group.key}>
                            <div className="flex items-center gap-2">
                              <Layers size={15} className="text-accent" />
                              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-ink">
                                {group.label}
                              </h3>
                              <span className="text-xs text-ink-lighter">
                                {group.subjects.length} course
                                {group.subjects.length === 1 ? "" : "s"}
                              </span>
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {group.subjects.map((s, i) => (
                                <motion.div
                                  key={s.id}
                                  initial={reduce ? false : { opacity: 0, y: 12 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.2) }}
                                >
                                  <SubjectCard subject={s}>{actions(s)}</SubjectCard>
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="border-y border-dashed border-line px-5 py-10 text-center">
                      <Building2 size={22} className="mx-auto text-ink-lighter" />
                      <p className="mt-3 text-sm text-ink-soft">
                        Pick a faculty and department to see the published courses by level.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="border-y border-dashed border-line px-5 py-10 text-center">
                  <Building2 size={22} className="mx-auto text-ink-lighter" />
                  <p className="mt-3 text-sm text-ink-soft">
                    Select a verified university to see its availability.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
  variant,
}: {
  active: boolean;
  variant: "workspace" | "editorial";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-10 items-center gap-1.5 px-4 py-2 text-sm font-semibold transition ${
        variant === "editorial" ? (active ? "subject-tab-active rounded-[1px] bg-[#14274a] text-white" : "rounded-[1px] text-[#34507c] hover:bg-[#fffdfa] hover:text-[#14274a]") : (active ? "bg-accent text-white shadow-sm" : "rounded-lg text-ink-soft hover:bg-surface hover:text-ink")
      }`}
    >
      {children}
    </button>
  );
}

function SubjectCard({
  subject,
  children,
}: {
  subject: Subject;
  children: ReactNode;
}) {
  return (
    <div className="subject-card flex h-full flex-col rounded-2xl border border-line bg-surface p-4 transition hover:border-accent/35 hover:shadow-[0_14px_30px_-26px_rgba(28,41,36,0.3)]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-base font-semibold leading-snug text-ink">
          {subject.name}
        </h3>
        {subject.code ? (
          <span className="shrink-0 rounded-md bg-ink/5 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
            {subject.code}
          </span>
        ) : null}
      </div>
      {subject.blurb ? (
        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-ink-soft">
          {subject.blurb}
        </p>
      ) : null}
      <div className="mt-auto pt-4">{children}</div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  placeholder,
  options,
  disabled,
  loading,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-lighter">
        {label}
      </span>
      <div className="relative mt-1.5">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="field-control pr-9"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-lighter"
        />
        {loading ? (
          <Loader2
            size={14}
            className="absolute right-9 top-1/2 -translate-y-1/2 animate-spin text-accent"
          />
        ) : null}
      </div>
    </label>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="surface-panel flex items-center justify-center gap-2 py-10 text-sm text-ink-soft">
      <Loader2 size={16} className="animate-spin text-accent" /> {label}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div className="status-empty">
      {text}
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="status-error">
      {text}
    </div>
  );
}

interface LevelGroup {
  key: string;
  label: string;
  subjects: Subject[];
}

function groupByLevel(subjects: Subject[]): LevelGroup[] {
  const map = new Map<number, Subject[]>();
  const others: Subject[] = [];
  for (const s of subjects) {
    if (s.level == null) {
      others.push(s);
    } else {
      const arr = map.get(s.level) ?? [];
      arr.push(s);
      map.set(s.level, arr);
    }
  }
  const levels = Array.from(map.keys()).sort((a, b) => a - b);
  const groups: LevelGroup[] = levels.map((lvl) => ({
    key: String(lvl),
    label: `${lvl} Level`,
    subjects: map.get(lvl) ?? [],
  }));
  if (others.length > 0) {
    groups.push({ key: "general", label: "General", subjects: others });
  }
  return groups;
}
