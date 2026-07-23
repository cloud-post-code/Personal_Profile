import { getProfile } from "@/lib/db";
import Chat from "./Chat";
import { starterQuestions } from "@/lib/theme";

// Reads the DB per-request (profile is admin-editable) — never prerender.
export const dynamic = "force-dynamic";

export default async function Home() {
  const profile = await getProfile();
  return (
    <Chat
      name={profile.name}
      tagline={profile.tagline}
      starters={starterQuestions}
    />
  );
}
