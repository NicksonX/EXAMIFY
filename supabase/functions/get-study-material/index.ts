import {
  corsHeaders,
  errorResponse,
  HttpError,
  optionsResponse,
  parseJsonBody,
  requiredUuid,
  requireUser,
  serviceClient,
} from "../_shared/security.ts";

type PlanSlug = "free" | "plus" | "pro";

function planRank(plan: PlanSlug): number {
  return plan === "pro" ? 2 : plan === "plus" ? 1 : 0;
}

Deno.serve(async (request) => {
  let headers: HeadersInit = {};
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return optionsResponse(request);
    if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.");

    const user = await requireUser(request);
    const { materialId } = await parseJsonBody(request);
    const id = requiredUuid(materialId, "material");
    const admin = serviceClient();
    const { data, error } = await admin
      .from("study_materials")
      .select("id, subject_id, topic_id, title, slug, level, content, word_count, read_minutes, is_sample, minimum_plan_slug, sort_order, subject:subjects(name, slug, category, code, level)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "MATERIAL_NOT_FOUND", "That study material was not found.");

    const { data: entitlement, error: entitlementError } = await admin.rpc("get_entitlement_for_user", {
      p_user_id: user.id,
    });
    if (entitlementError) throw entitlementError;
    const activePlan: PlanSlug = entitlement && typeof entitlement === "object" && !Array.isArray(entitlement)
      && ((entitlement as Record<string, unknown>).plan === "plus" || (entitlement as Record<string, unknown>).plan === "pro")
      ? (entitlement as Record<string, unknown>).plan as Exclude<PlanSlug, "free">
      : "free";
    const requirement = data.minimum_plan_slug as PlanSlug;
    const granted = planRank(activePlan) >= planRank(requirement);
    const preview = {
      id: data.id,
      subject_id: data.subject_id,
      topic_id: data.topic_id,
      title: data.title,
      slug: data.slug,
      level: data.level,
      word_count: data.word_count,
      read_minutes: data.read_minutes,
      is_sample: data.is_sample,
      minimum_plan_slug: requirement,
      sort_order: data.sort_order,
      subject: data.subject,
    };
    return Response.json({ material: granted ? { ...preview, content: data.content } : preview, access: { granted, requirement } }, { headers });
  } catch (error) {
    return errorResponse(error, headers ?? { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  }
});
