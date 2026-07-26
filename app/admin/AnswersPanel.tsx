import { CARD_TOOLS, cannedStats } from "@/lib/canned";
import { saveCanned, deleteCanned } from "./actions";
import { panel, field, btn, btnDanger, SectionTitle, Label } from "./ui";

/**
 * The "Answers" tab: hand-written replies to the questions visitors ask over
 * and over. A filled-in row is served straight from the database with no model
 * call; a blank one is just a to-do and falls through to the chatbot, so the
 * tab is safe to leave half-finished.
 */

type Row = {
  id: string;
  question: string;
  answer: string;
  cardTool: string | null;
  cardInput: string | null;
  enabled: boolean;
  hits: number;
  order: number;
};

export function AnswersPanel({ rows }: { rows: Row[] }) {
  const stats = cannedStats(rows);

  return (
    <div>
      <div style={panel}>
        <SectionTitle>Answers</SectionTitle>
        <p style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.55 }}>
          When a visitor&apos;s question matches one of these, they get your words
          instantly and the model is never called. Matching ignores case, spacing
          and a trailing question mark — anything else goes to the chatbot.
        </p>
        <div style={{ display: "flex", gap: 18, fontSize: 13, flexWrap: "wrap" }}>
          <span><strong>{stats.live}</strong> live</span>
          <span><strong>{stats.unanswered}</strong> still unanswered</span>
          <span><strong>{stats.callsSaved}</strong> model calls saved</span>
        </div>
      </div>

      {rows.map((r) => (
        <AnswerForm key={r.id} row={r} />
      ))}

      <AnswerForm />
    </div>
  );
}

function AnswerForm({ row }: { row?: Row }) {
  const isNew = !row;
  return (
    <form action={saveCanned} style={panel}>
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <input type="hidden" name="order" value={row?.order ?? 99} />

      <Label>{isNew ? "New question" : "Question"}</Label>
      <input
        name="question"
        defaultValue={row?.question ?? ""}
        placeholder="What do visitors ask?"
        style={field}
      />

      <Label>Answer{isNew ? "" : row.answer.trim() ? "" : " — not written yet"}</Label>
      <textarea
        name="answer"
        rows={4}
        defaultValue={row?.answer ?? ""}
        placeholder="Leave blank to let the chatbot answer this one."
        style={{ ...field, resize: "vertical", fontFamily: "inherit" }}
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 200px" }}>
          <Label>Show a card</Label>
          <select name="cardTool" defaultValue={row?.cardTool ?? ""} style={field}>
            <option value="">No card</option>
            {CARD_TOOLS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <Label>Card options (JSON)</Label>
          <input
            name="cardInput"
            defaultValue={row?.cardInput ?? ""}
            placeholder='{"layout":"filmstrip"}'
            style={field}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" name="enabled" defaultChecked={row?.enabled ?? true} />
          Live
        </label>
        <button type="submit" style={btn}>
          {isNew ? "Add" : "Save"}
        </button>
        {row ? (
          <>
            <button type="submit" formAction={deleteCanned} style={btnDanger}>
              Delete
            </button>
            <span style={{ fontSize: 12, fontStyle: "italic", marginLeft: "auto" }}>
              served {row.hits}×
            </span>
          </>
        ) : null}
      </div>
    </form>
  );
}
