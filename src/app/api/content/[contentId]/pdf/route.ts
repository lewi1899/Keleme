import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Issues a short-lived signed URL for a PDF textbook.
 *
 * The bucket is private and no student holds a storage policy on it, so this
 * route is the only way a PDF is ever reachable. The order of operations is
 * the security property:
 *
 *   1. Ask the DATABASE whether this caller may have this item, using the
 *      caller's own session — so RLS and can_access_content decide, not this
 *      route's own reading of the rules.
 *   2. Only then use the service role to sign, and only for the exact
 *      storage_path stored on that row.
 *
 * The service role never sees a path that came from the request. A caller can
 * change the content id in the URL all they like; step 1 answers for it.
 */
export async function GET(_request: Request, { params }: { params: { contentId: string } }) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to download this." }, { status: 401 });
  }

  const { data: allowed, error: accessError } = await supabase.rpc("can_access_content", {
    p_content: params.contentId,
  });

  if (accessError) {
    return NextResponse.json({ error: "We could not check your access." }, { status: 500 });
  }
  if (!allowed) {
    return NextResponse.json(
      { error: "This textbook is not included in your plan." },
      { status: 403 }
    );
  }

  // Readable because access has already been granted above.
  const { data: item } = await supabase
    .from("content_items")
    .select("storage_path, title, content_type")
    .eq("id", params.contentId)
    .maybeSingle();

  if (!item || item.content_type !== "pdf" || !item.storage_path) {
    return NextResponse.json({ error: "That file could not be found." }, { status: 404 });
  }

  const admin = createAdminClient();

  const { data: ttlSetting } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "signed_url_ttl_seconds")
    .maybeSingle();
  const ttl = Number(ttlSetting?.value ?? 300);

  const { data: signed, error: signError } = await admin.storage
    .from("content-pdfs")
    .createSignedUrl(item.storage_path, ttl, {
      // Names the saved file after the textbook instead of the storage key,
      // and makes the browser save rather than navigate.
      download: `${item.title.replace(/[^\w\s.-]/g, "").trim() || "keleme"}.pdf`,
    });

  if (signError || !signed) {
    return NextResponse.json({ error: "We could not prepare that download." }, { status: 500 });
  }

  // Recorded through the same RPC students' reads go through, so a download
  // counts toward the day's activity like any other study action.
  await supabase.rpc("record_learning_event", {
    p_kind: "content_opened",
    p_content_id: params.contentId,
  });

  return NextResponse.json({ url: signed.signedUrl, expiresIn: ttl });
}
