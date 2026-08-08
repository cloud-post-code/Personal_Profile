import { saveUpload } from "@/lib/uploads";
import { isAuthed } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Takes an image the admin attaches to a card-builder prompt and stores it on
 * the upload volume, returning the src the card would use.
 *
 * Uploading here is deliberately separate from the build itself: the file
 * lands once, and every subsequent draft/revise turn passes only its small
 * JSON descriptor. Re-posting megabytes of base64 on each revision would slow
 * a loop that already runs several model turns.
 *
 * Admin-only — this writes to the same volume the public gallery serves from.
 */
export async function POST(req: Request) {
  if (!(await isAuthed())) return new Response("Unauthorized", { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return new Response("Choose an image first.", { status: 400 });
  }
  // The card sandbox and the gallery both serve whatever lands here, so the
  // ceiling is about keeping one prompt's attachment sane, not about storage.
  if (file.size > 10 * 1024 * 1024) {
    return new Response("That image is over 10MB — use a smaller one.", { status: 400 });
  }

  try {
    const filename = await saveUpload(file);
    return Response.json({ src: `/api/uploads/${filename}` });
  } catch (e) {
    // saveUpload rejects anything outside jpg/png/webp/gif by content type.
    return new Response(e instanceof Error ? e.message : "That file couldn't be saved.", {
      status: 400,
    });
  }
}
