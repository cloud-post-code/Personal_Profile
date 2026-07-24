import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { login } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isAuthed()) redirect("/admin/dashboard");
  const { error } = await searchParams;

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <form
        action={login}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: 32,
          width: "100%",
          maxWidth: 380,
          boxShadow: "var(--glow-primary)",
        }}
      >
        <h1 style={{ fontSize: 24, marginBottom: 6 }}>Admin</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 20 }}>
          Blake&apos;s control room. Add projects, scan links, upload photos.
        </p>
        {error && (
          <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }}>
            Wrong password. Try again.
          </p>
        )}
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          style={{
            width: "100%",
            padding: "12px 14px",
            background: "var(--bg-soft)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            marginBottom: 14,
            outline: "none",
          }}
        />
        <button
          type="submit"
          style={{
            width: "100%",
            padding: "12px",
            background: "var(--primary)",
            color: "var(--on-primary)",
            border: "none",
            borderRadius: "var(--radius-md)",
            fontWeight: 600,
          }}
        >
          Enter →
        </button>
        <a href="/" style={{ display: "block", textAlign: "center", marginTop: 16, fontSize: 13 }}>
          ← back to site
        </a>
      </form>
    </main>
  );
}
