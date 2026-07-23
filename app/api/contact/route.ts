import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** Records a contact submission from the in-chat A2UI contact form. */
export async function POST(req: Request) {
  let body: { name?: string; email?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim().slice(0, 200);
  const email = String(body.email ?? "").trim().slice(0, 200);
  const message = String(body.message ?? "").trim().slice(0, 5000);

  if (!name || !email || !message) {
    return Response.json({ ok: false, error: "All fields are required." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ ok: false, error: "That email doesn't look right." }, { status: 400 });
  }

  try {
    await prisma.contact.create({ data: { name, email, message } });
  } catch {
    return Response.json({ ok: false, error: "Could not save. Try again." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
