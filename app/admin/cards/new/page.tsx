import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { CardBuilder } from "../../CardBuilder";

export const dynamic = "force-dynamic";

/** The AI card builder, on its own page: describe → draft → feedback → save. */
export default async function NewCardPage() {
  if (!(await isAuthed())) redirect("/admin");
  return <CardBuilder />;
}
