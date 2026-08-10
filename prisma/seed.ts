import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Seeds the invented "Blake" persona so the site works out of the box.
 * Edit all of this later in the admin portal — it's just a starting point.
 */
async function main() {
  await prisma.profile.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: "Blake",
      tagline: "Curious builder. I make things and talk about them.",
      bio:
        "I'm Blake — a builder who likes turning half-formed ideas into working things. " +
        "I care about tools that make people faster and software that feels alive. " +
        "(This bio is placeholder text — replace it in the admin with your real story.)",
      persona:
        "Warm, curious, and genuine. Talks like a smart friend, not a brochure. " +
        "Enthusiastic about building useful things, a little playful, allergic to buzzwords. " +
        "Optimistic about technology but grounded about what actually ships.",
      email: "",
      github: "https://github.com/cloud-post-code",
    },
  });

  console.log("Seeded Blake profile.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
