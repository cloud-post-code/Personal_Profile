import { revalidatePath } from "next/cache";
import { isAuthed } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fetchGithubProjects, enrichProject } from "@/lib/github";

export const runtime = "nodejs";

/**
 * Streaming GitHub import. Same newline-delimited JSON protocol as /api/chat —
 * one object per line, so the admin panel can show each project the moment it
 * is enriched and saved instead of waiting for the whole batch:
 *   {"t":"start","total":n,"skipped":n}   import begins (after dedupe)
 *   {"t":"project","v":{...}}             one enriched project, already saved
 *   {"t":"done"}                          all projects imported
 *   {"t":"error","v":"message"}           import stopped (bad user, rate limit)
 */
export async function POST(req: Request) {
  if (!(await isAuthed())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { profile?: string };
  const input = String(body.profile ?? "").trim();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const line = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        const repos = await fetchGithubProjects(input);

        // Avoid duplicates: skip repos whose githubUrl is already a project.
        const existing = await prisma.project.findMany({ select: { githubUrl: true } });
        const seen = new Set(existing.map((p) => p.githubUrl).filter(Boolean));
        const fresh = repos.filter((r) => !seen.has(r.githubUrl));

        line({ t: "start", total: fresh.length, skipped: repos.length - fresh.length });

        // Sequential on purpose: enrich → save → emit, one project at a time,
        // so cards appear in the admin panel as each one completes.
        let order = await prisma.project.count();
        for (const repo of fresh) {
          const enriched = await enrichProject(repo);
          const project = await prisma.project.create({
            data: {
              name: repo.name,
              blurb: enriched.blurb,
              detail: enriched.detail || null,
              tags: JSON.stringify(enriched.tags),
              githubUrl: repo.githubUrl,
              liveUrl: repo.liveUrl,
              order: order++,
            },
          });
          line({
            t: "project",
            v: {
              id: project.id,
              name: project.name,
              blurb: project.blurb,
              detail: project.detail ?? "",
              tags: enriched.tags,
              githubUrl: project.githubUrl,
              liveUrl: project.liveUrl,
              stars: repo.stars,
            },
          });
        }

        revalidatePath("/admin/dashboard");
        revalidatePath("/projects");
        revalidatePath("/");
        line({ t: "done" });
      } catch (err) {
        line({ t: "error", v: err instanceof Error ? err.message : "Import failed." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
