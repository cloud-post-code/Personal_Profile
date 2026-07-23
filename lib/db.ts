import { PrismaClient } from "@prisma/client";

// Reuse the client across hot reloads in dev to avoid connection exhaustion.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Load the singleton Profile row, creating a default if missing. */
export async function getProfile() {
  const existing = await prisma.profile.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.profile.create({
    data: {
      id: 1,
      name: "Blake",
      tagline: "Curious builder. I make things and talk about them.",
      bio: "",
      persona: "",
    },
  });
}
