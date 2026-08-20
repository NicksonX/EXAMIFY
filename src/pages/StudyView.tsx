import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ClipboardList, Clock, Crown, Download, Lightbulb, Loader2, Lock, Pencil, Sigma, Target } from "lucide-react";
import { fetchStudyMaterial, type ContentBlock, type StudyMaterial, type StudyMaterialContent } from "@/lib/exams";
import { downloadStudyMaterialPdf, getMyEntitlement } from "@/lib/premium";

type LoadState = "loading" | "ready" | "error";

export function StudyView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [state, setState] = useState<LoadState>("loading");
  const [material, setMaterial] = useState<StudyMaterial | null>(null);
  const [access, setAccess] = useState<{ granted: boolean; requirement: "free" | "plus" | "pro" } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [canDownloadStudyPdf, setCanDownloadStudyPdf] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    if (!id) { setErrorMsg("No lesson id was provided in the link."); setState("error"); return; }
    let active = true;
    void (async () => {
      try {
        const response = await fetchStudyMaterial(id);
        if (!active) return;
        if (!response) { setErrorMsg("We couldn't find this lesson. It may have been removed."); setState("error"); return; }
        setMaterial(response.material);
        setAccess({ granted: response.granted, requirement: response.requirement });
        setState("ready");
      } catch { if (active) { setErrorMsg("Something went wrong loading this lesson. Please try again."); setState("error"); } }
    })();
    return () => { active = false; };
  }, [id]);

  useEffect(() => { document.title = material ? `${material.title} - Study - Examify` : "Study - Examify"; return () => { document.title = "Examify"; }; }, [material]);

  useEffect(() => {
    let active = true;
    void getMyEntitlement().then((entitlement) => { if (active) setCanDownloadStudyPdf(entitlement.canReadPro); }).catch(() => { if (active) setCanDownloadStudyPdf(false); });
    return () => { active = false; };
  }, []);

  const goBack = () => {
    const fallback = material ? `/study?subject_id=${material.subject_id}` : "/study";
    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) navigate(-1);
    else navigate(fallback);
  };

  const downloadPdf = async () => {
    if (!material || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const pdf = await downloadStudyMaterialPdf(material.id);
      const url = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = url;
      link.download = `examify-${material.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "study-material"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch { setErrorMsg("We couldn't prepare the study-material PDF. Please try again."); }
    finally { setDownloadingPdf(false); }
  };

  if (state === "loading") return <div className="editorial-page-narrow flex min-h-[60vh] items-center justify-center"><div className="flex flex-col items-center gap-3 text-[#34507c]"><Loader2 className="h-8 w-8 animate-spin text-[#ce4040]" /><p className="text-sm">Loading your lesson...</p></div></div>;
  if (state === "error" || !material) return <div className="editorial-page-narrow"><div className="editorial-empty flex flex-col items-center gap-4"><AlertTriangle size={25} className="text-[#ce4040]" /><h1 className="font-editorial-display text-3xl font-semibold tracking-[-0.05em] text-[#14274a]">We can't show this lesson</h1><p className="text-sm leading-6 text-[#34507c]">{errorMsg}</p><Link to="/study" className="editorial-button-primary mt-2"><ArrowLeft size={16} />Browse study materials</Link></div></div>;

  const canRead = access?.granted === true;
  if (!canRead) return <div className="editorial-page-narrow"><div className="editorial-panel flex flex-col items-center gap-4 p-8 text-center sm:p-10"><span className="flex h-12 w-12 items-center justify-center bg-[#14274a] text-white"><Lock size={22} /></span><p className="editorial-kicker">Examify {access?.requirement === "plus" ? "Plus" : "Pro"}</p><h1 className="font-editorial-display text-3xl font-semibold tracking-[-0.055em] text-[#14274a]">This lesson needs Examify {access?.requirement === "plus" ? "Plus" : "Pro"}</h1><p className="max-w-md text-sm leading-6 text-[#34507c]">Free members can read selected sample lessons. Plus unlocks selected additional lessons; Pro unlocks the full available library.</p><div className="mt-2 flex flex-wrap justify-center gap-3"><Link to="/upgrade" state={{ reason: "study" }} className="editorial-button-primary"><Crown size={16} />View plans</Link><button type="button" onClick={goBack} className="editorial-button-secondary"><ArrowLeft size={16} />Back to lessons</button></div></div></div>;

  const subjectName = material.subject?.name ?? "Study";
  const content: StudyMaterialContent = material.content ?? ({} as StudyMaterialContent);
  const sections = content.sections ?? [];
  const outlineItems = [
    { href: "#overview", label: "Overview" },
    ...(content.objectives?.length ? [{ href: "#objectives", label: "Objectives" }] : []),
    ...sections.map((section, index) => ({ href: `#section-${index}`, label: section.heading })),
    ...(content.formulas?.length ? [{ href: "#formulas", label: "Formulas" }] : []),
    ...(content.key_points?.length ? [{ href: "#key-points", label: "Key points" }] : []),
    ...(content.summary ? [{ href: "#summary", label: "Summary" }] : []),
    ...(content.practice?.length ? [{ href: "#practice", label: "Practice" }] : []),
  ];
  const practiceParams = new URLSearchParams({ subject_id: material.subject_id });
  if (material.topic_id) practiceParams.set("topic_id", material.topic_id);
  const practiceHref = `/practice?${practiceParams.toString()}`;

  return <div className="study-reader">
    <header className="study-reader-bar no-print"><button type="button" onClick={goBack} className="study-reader-back"><ArrowLeft size={16} /><span>Back</span></button><div className="min-w-0 text-center"><p className="truncate font-editorial-display text-lg font-semibold tracking-[-0.04em] text-[#14274a]">{material.title}</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#34507c]">{subjectName} · {material.read_minutes} min read</p></div><div className="flex justify-end gap-1">{canDownloadStudyPdf ? <button type="button" onClick={() => void downloadPdf()} disabled={downloadingPdf} className="study-reader-exam" aria-label="Download branded study PDF">{downloadingPdf ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />}<span className="hidden lg:inline">PDF</span></button> : null}<Link to={practiceHref} className="study-reader-exam"><ClipboardList size={15} /><span className="hidden sm:inline">Practice</span></Link></div></header>
    <div className="study-reader-layout">
      <aside className="study-reader-outline no-print" aria-label="Lesson outline"><p className="editorial-kicker">In this document</p><nav className="mt-4 space-y-1">{outlineItems.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}</nav></aside>
      <div className="study-reader-mobile-outline no-print"><button type="button" onClick={() => setOutlineOpen((open) => !open)} aria-expanded={outlineOpen}><span>Lesson outline</span><ChevronDown size={16} className={outlineOpen ? "rotate-180" : ""} /></button>{outlineOpen ? <nav>{outlineItems.map((item) => <a key={item.href} href={item.href} onClick={() => setOutlineOpen(false)}>{item.label}</a>)}</nav> : null}</div>
      <article className="study-reader-scroll" aria-label={`${material.title} reading content`}><motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="study-reader-document"><div className="study-reader-document-head" id="overview"><div className="flex flex-wrap items-center gap-2"><p className="editorial-kicker">Study material</p><span className="editorial-badge">{material.minimum_plan_slug === "free" ? "Free sample" : material.minimum_plan_slug === "plus" ? "Plus" : "Pro"}</span></div><h1>{material.title}</h1><div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#34507c]"><span className="inline-flex items-center gap-1"><Clock size={13} />{material.read_minutes} min read</span>{material.word_count ? <span>{material.word_count.toLocaleString()} words</span> : null}{material.level ? <span>{material.level} Level</span> : null}<span>{subjectName}</span></div></div><div className="study-reader-content">{content.intro ? <p className="study-reader-intro">{content.intro}</p> : null}{content.objectives?.length ? <DocumentBlock id="objectives" icon={Target} title="Learning objectives"><ol className="study-reader-list">{content.objectives.map((objective, index) => <li key={index}><span>{index + 1}</span>{objective}</li>)}</ol></DocumentBlock> : null}{sections.map((section, index) => <section key={index} id={`section-${index}`} className="study-reader-section"><h2>{section.heading}</h2><div className="mt-5 space-y-4">{section.blocks.map((block, blockIndex) => <BlockLine key={blockIndex} block={block} />)}</div></section>)}{content.formulas?.length ? <DocumentBlock id="formulas" icon={Sigma} title="Important formulas"><ul className="study-reader-formulas">{content.formulas.map((formula, index) => <li key={index}>{formula}</li>)}</ul></DocumentBlock> : null}{content.key_points?.length ? <DocumentBlock id="key-points" icon={Lightbulb} title="Key points"><ul className="study-reader-points">{content.key_points.map((point, index) => <li key={index}><CheckCircle2 size={16} />{point}</li>)}</ul></DocumentBlock> : null}{content.summary ? <DocumentBlock id="summary" icon={ClipboardList} title="Summary"><p className="study-reader-copy">{content.summary}</p></DocumentBlock> : null}{content.practice?.length ? <DocumentBlock id="practice" icon={Pencil} title="Practice questions"><ol className="study-reader-list">{content.practice.map((question, index) => <li key={index}><span>{index + 1}</span>{question}</li>)}</ol></DocumentBlock> : null}<section className="study-reader-cta no-print"><div><p className="editorial-kicker">Apply what you learned</p><h2>Ready to practise?</h2><p>Choose an available full or topic practice exam from the practice centre.</p></div><Link to={practiceHref} className="editorial-button-primary"><ClipboardList size={16} />Choose practice</Link></section></div></motion.div></article>
    </div>
  </div>;
}

function DocumentBlock({ id, icon: Icon, title, children }: { id: string; icon: typeof Target; title: string; children: React.ReactNode }) { return <section id={id} className="study-reader-block"><div className="study-reader-block-title"><span><Icon size={15} /></span><h2>{title}</h2></div><div className="mt-4">{children}</div></section>; }
function BlockLine({ block }: { block: ContentBlock }) { if (block.type === "example") return <aside className="study-reader-example"><p>Example</p>{block.problem ? <strong>{block.problem}</strong> : null}{block.solution ? <div><span>Solution</span><p>{block.solution}</p></div> : null}</aside>; return <p className="study-reader-copy">{block.text ?? ""}</p>; }
