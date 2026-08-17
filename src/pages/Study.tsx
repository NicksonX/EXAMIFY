import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  Crown,
  FileText,
  GraduationCap,
  Loader2,
  Lock,
  Pencil,
  AlertTriangle,
} from "lucide-react";
import { SubjectBrowser } from "@/components/SubjectBrowser";
import {
  fetchStudyMaterials,
  fetchSubject,
  type StudyMaterialPreview,
  type Subject,
} from "@/lib/exams";
import { getMyEntitlement, type EntitlementInfo } from "@/lib/premium";

type LoadState = "loading" | "ready" | "error";

const FLOW_STEPS = [
  {
    icon: GraduationCap,
    title: "Pick a subject",
    body: "Choose any secondary subject or university course from the catalogue.",
  },
  {
    icon: BookOpen,
    title: "Read a lesson",
    body: "Work through structured notes with worked examples and formulas.",
  },
  {
    icon: Pencil,
    title: "Take the lesson exam",
    body: "Test yourself on exactly what you just studied, then review your score.",
  },
];

export function Study() {
  const [searchParams] = useSearchParams();
  const reduce = useReducedMotion();
  const subjectId = searchParams.get("subject_id");

  const [state, setState] = useState<LoadState>("loading");
  const [subject, setSubject] = useState<Subject | null>(null);
  const [materials, setMaterials] = useState<StudyMaterialPreview[]>([]);
  const [entitlement, setEntitlement] = useState<EntitlementInfo | null>(null);

  useEffect(() => {
    document.title = subject
      ? `Study - ${subject.name} - Examify`
      : "Study - Examify";
  }, [subject]);

  useEffect(() => {
    let active = true;
    void getMyEntitlement().then((current) => {
      if (active) setEntitlement(current);
    }).catch(() => {
      if (active) setEntitlement(null);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!subjectId) return;
    let active = true;
    setState("loading");
    void (async () => {
      try {
        const [s, mats] = await Promise.all([
          fetchSubject(subjectId),
          fetchStudyMaterials(subjectId),
        ]);
        if (!active) return;
        setSubject(s);
        setMaterials(mats);
        setState("ready");
      } catch {
        if (active) setState("error");
      }
    })();
    return () => {
      active = false;
    };
  }, [subjectId]);

  // ---- Subject picker (no subject selected) ----
  if (!subjectId) {
    return (
        <div className="editorial-page">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <p className="editorial-kicker">Study</p>
            <h1 className="editorial-section-title mt-5">Study, then test yourself</h1>
            <p className="editorial-copy mt-4 max-w-xl">
              Read structured notes for any subject or course. Each lesson ends
              with a short exam on exactly what you just learned.
            </p>
          </motion.div>

          {/* Flow explainer */}
          <div className="mt-8 divide-y divide-[#14274a]/15 border-y border-[#14274a]/15 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {FLOW_STEPS.map((step, i) => (
              <div key={step.title} className="py-5 sm:px-5 sm:first:pl-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[2px] bg-[#14274a] text-white">
                    <step.icon size={18} />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#34507c]">
                    Step {i + 1}
                  </span>
                </div>
                <h3 className="font-editorial-display mt-3 text-xl font-semibold tracking-[-0.04em] text-[#14274a]">
                  {step.title}
                </h3>
                <p className="mt-1 text-sm leading-6 text-[#34507c]">{step.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-10">
            <SubjectBrowser
              heading="Pick a subject to study"
              variant="editorial"
              actions={(s) => (
                <Link
                  to={`/study?subject_id=${s.id}`}
                  className="editorial-button-primary w-full"
                >
                  <BookOpenCheck size={15} /> Study materials
                </Link>
              )}
            />
          </div>
        </div>
    );
  }

  // ---- Materials list for a chosen subject ----
  return (
      <div className="editorial-page max-w-4xl">
        <Link
          to="/study"
          className="editorial-text-link inline-flex items-center gap-2"
        >
          <ArrowLeft size={16} /> All subjects
        </Link>

        {state === "loading" ? (
          <div className="mt-12 flex flex-col items-center gap-3 text-[#34507c]">
            <Loader2 className="h-7 w-7 animate-spin text-[#ce4040]" />
            <p className="text-sm">Loading study materials...</p>
          </div>
        ) : state === "error" ? (
          <EditorialFeedback
            title="We couldn't load these materials"
            body="Something went wrong fetching the study materials. Please try again."
          />
        ) : !subject ? (
          <EditorialFeedback
            title="Subject not found"
            body="We couldn't find that subject. Pick another from the catalogue."
          />
        ) : (
          <>
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-6"
            >
              <p className="editorial-kicker">Study materials</p>
              <h1 className="editorial-section-title mt-5">{subject.name}</h1>
              {subject.blurb ? <p className="editorial-copy mt-4 max-w-xl">{subject.blurb}</p> : null}
            </motion.div>

            {materials.length === 0 ? (
              <div className="editorial-empty mt-8 flex flex-col items-center gap-3">
                <p className="font-editorial-display text-2xl font-semibold text-[#14274a]">No lessons yet</p>
                <p className="max-w-sm text-sm leading-6 text-[#34507c]">
                  We're still writing structured notes for this subject. Sample
                  lessons will appear here soon, with a lesson exam to follow.
                </p>
                <Link to="/study" className="editorial-button-secondary mt-2">
                  <ArrowLeft size={15} /> Browse other subjects
                </Link>
              </div>
            ) : (
              <ul className="mt-7 divide-y divide-[#14274a]/15 border-y border-[#14274a]/15">
                {materials.map((m) => (
                  <li key={m.id}>
                    <MaterialCard material={m} entitlement={entitlement} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
  );
}

function MaterialCard({
  material,
  entitlement,
}: {
  material: StudyMaterialPreview;
  entitlement: EntitlementInfo | null;
}) {
  const readable = material.minimum_plan_slug === "free"
    || (material.minimum_plan_slug === "plus" && entitlement?.canReadPlus === true)
    || (material.minimum_plan_slug === "pro" && entitlement?.canReadPro === true);
  const meta = [
    `${material.read_minutes} min read`,
    material.word_count ? `${material.word_count.toLocaleString()} words` : null,
    material.level ? `${material.level} Level` : null,
  ]
    .filter(Boolean)
    .join(" - ");

  if (!readable) {
    return (
      <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] border border-[#14274a]/15 bg-[#fffdfa]/60 text-[#ce4040]">
          <Lock size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-editorial-display text-xl font-semibold tracking-[-0.04em] text-[#14274a]">{material.title}</h3>
            <span className="editorial-badge shrink-0 text-[#ce4040]">{material.minimum_plan_slug === "plus" ? "Plus" : "Pro"}</span>
          </div>
          <p className="mt-1 truncate text-xs text-[#34507c]">{meta}</p>
        </div>
        <Link to="/upgrade" state={{ reason: "study" }} className="editorial-button-secondary w-full shrink-0 sm:w-auto">
          <Crown size={15} /> Unlock
        </Link>
      </div>
    );
  }

  return (
    <Link to={`/study/${material.id}`} className="group flex items-center gap-4 py-5 transition hover:bg-[#fffdfa]/45">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] bg-[#14274a] text-white"><FileText size={18} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-editorial-display text-xl font-semibold tracking-[-0.04em] text-[#14274a]">{material.title}</h3>
          {material.is_sample ? <span className="editorial-badge shrink-0">Free sample</span> : null}
        </div>
        <p className="mt-1 truncate text-xs text-[#34507c]">{meta}</p>
      </div>
      <ArrowRight size={18} className="shrink-0 text-[#34507c] transition group-hover:translate-x-1 group-hover:text-[#ce4040]" />
    </Link>
  );
}

function EditorialFeedback({ title, body }: { title: string; body: string }) {
  return (
    <div className="editorial-empty mt-12 flex flex-col items-center gap-4">
      <AlertTriangle size={24} className="text-[#ce4040]" />
      <h1 className="font-editorial-display text-3xl font-semibold tracking-[-0.05em] text-[#14274a]">{title}</h1>
      <p className="max-w-md text-sm leading-6 text-[#34507c]">{body}</p>
      <Link to="/study" className="editorial-button-primary mt-2"><ArrowLeft size={16} /> Back to subjects</Link>
    </div>
  );
}
