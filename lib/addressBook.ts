import { prisma } from "@/lib/db";

/**
 * Blake's hand-curated address book, edited on the Agent Behavior → Contacts
 * tab. Each entry is a person reachable by email and/or phone, tagged with a
 * trust tier that mirrors the ingestion classifications so one vocabulary
 * covers "who is this content for" and "how much do I trust this person".
 *
 * Data + pure helpers only, so it stays provable offline. Distinct from the
 * `Contact` model, which stores in-chat contact-form submissions.
 */

/** Trust tiers, stable slugs; labels are presentation. Ordered least→most. */
export const TRUST_TIERS = ["public", "co-worker", "close-friend", "personal"] as const;
export type TrustTier = (typeof TRUST_TIERS)[number];
export const TRUST_LABELS: Record<TrustTier, string> = {
  public: "Public",
  "co-worker": "Co-worker",
  "close-friend": "Close friend",
  personal: "Personal",
};

export type AddressBookRow = {
  id: string;
  name: string;
  details: string;
  email: string;
  phone: string;
  trust: string;
  order: number;
  createdAt: Date;
};

export async function listAddressBook(): Promise<AddressBookRow[]> {
  return prisma.addressBookEntry.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
}

/**
 * Write one contact from the admin form. A blank id creates; a blank name is
 * a no-op — a nameless contact is meaningless. Trust falls back to "public"
 * when the posted value isn't a known tier.
 */
export async function saveAddressBookEntry(input: {
  id?: string;
  name: string;
  details: string;
  email: string;
  phone: string;
  trust: string;
  order?: number;
}): Promise<void> {
  const name = input.name.trim();
  if (!name) return;
  const trust = (TRUST_TIERS as readonly string[]).includes(input.trust)
    ? input.trust
    : "public";
  const data = {
    name,
    details: input.details.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    trust,
    order: input.order ?? 0,
  };
  if (input.id) {
    await prisma.addressBookEntry.update({ where: { id: input.id }, data });
  } else {
    await prisma.addressBookEntry.create({ data });
  }
}

export async function deleteAddressBookEntry(id: string): Promise<void> {
  await prisma.addressBookEntry.delete({ where: { id } });
}
