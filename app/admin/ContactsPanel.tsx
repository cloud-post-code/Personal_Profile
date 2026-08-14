import { saveAddressBookAction, deleteAddressBookAction } from "./actions";
import { PendingButton } from "./PendingButton";
import { panel, field, btn, btnDanger, SectionTitle, Label } from "./ui";
import { TRUST_TIERS, TRUST_LABELS, type AddressBookRow } from "@/lib/addressBook";

/**
 * The Contacts sub-tab of the Agent Behavior section — Blake's hand-curated
 * address book. Each existing person gets an editable form (name, details,
 * email, phone, trust status, Save, Delete); a blank form at the bottom adds
 * one at a time, the DirectivesPanel / ExperienceEditor pattern.
 *
 * Trust tiers mirror the ingestion classifications: Public, Co-worker,
 * Close friend, Personal.
 */
export function ContactsPanel({ rows }: { rows: AddressBookRow[] }) {
  return (
    <section>
      <div data-fill="surface" style={panel}>
        <SectionTitle>Contacts</SectionTitle>
        <p style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 13, marginBottom: 10 }}>
          People in Blake&apos;s address book — each reachable by email or phone
          and tagged with a trust status. Trust tiers match the ingestion
          classifications: Public, Co-worker, Close friend, Personal.
        </p>
        <p style={{ fontSize: 13 }}>
          <strong>{rows.length}</strong> {rows.length === 1 ? "contact" : "contacts"}
        </p>
      </div>

      {rows.map((r) => (
        <ContactForm key={r.id} row={r} />
      ))}

      <ContactForm />
    </section>
  );
}

function ContactForm({ row }: { row?: AddressBookRow }) {
  const isNew = !row;

  return (
    <form action={saveAddressBookAction} data-fill="surface" style={panel}>
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <input type="hidden" name="order" value={row?.order ?? 0} />

      <Label>{isNew ? "New contact" : "Contact"}</Label>
      <input
        name="name"
        defaultValue={row?.name ?? ""}
        placeholder="Name"
        style={field}
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        <input
          name="email"
          type="email"
          defaultValue={row?.email ?? ""}
          placeholder="Email"
          style={{ ...field, flex: "1 1 220px" }}
        />
        <input
          name="phone"
          type="tel"
          defaultValue={row?.phone ?? ""}
          placeholder="Phone number"
          style={{ ...field, flex: "1 1 180px" }}
        />
      </div>

      <textarea
        name="details"
        rows={2}
        defaultValue={row?.details ?? ""}
        placeholder="Details about this person"
        style={{ ...field, resize: "vertical", fontFamily: "inherit", marginTop: 10 }}
      />

      <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap", marginTop: 10 }}>
        <div style={{ display: "grid", gap: 6, flex: "1 1 200px" }}>
          <Label>Trust status</Label>
          <select name="trust" defaultValue={row?.trust ?? "public"} style={field}>
            {TRUST_TIERS.map((t) => (
              <option key={t} value={t}>
                {TRUST_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <PendingButton pendingLabel={isNew ? "Adding…" : "Saving…"} style={btn}>
          {isNew ? "Add" : "Save"}
        </PendingButton>
        {row ? (
          <PendingButton pendingLabel="Deleting…" formAction={deleteAddressBookAction} style={btnDanger}>
            Delete
          </PendingButton>
        ) : null}
      </div>
    </form>
  );
}
