#!/usr/bin/env node
/**
 * Switch prisma/schema.prisma to Postgres for Railway deploy.
 *   node scripts/use-postgres.mjs           -> postgres (adds @db.Text)
 *   node scripts/use-postgres.mjs --sqlite  -> sqlite   (strips @db.Text)
 *
 * The repo is developed locally on SQLite; production is Postgres. Only the
 * `provider` line and the long-text column annotations differ.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "..", "prisma", "schema.prisma");

const toSqlite = process.argv.includes("--sqlite");
let s = readFileSync(schemaPath, "utf8");

// Long-text fields that should be @db.Text on Postgres.
const longFields = [
  "rawText", "summary", "bio", "persona", "blurb", "detail", "description", "message",
  "overview", "values", "aesthetic", "tone", "text",
  "firstQuery", "content", "note", "experience", "experienceSummary", "other",
];

if (toSqlite) {
  s = s.replace(/provider = "postgresql"/, 'provider = "sqlite"');
  // Strip any @db.Text annotations (SQLite has no such type modifier).
  s = s.replace(/\s+@db\.Text/g, "");
} else {
  s = s.replace(/provider = "sqlite"/, 'provider = "postgresql"');
  // Add @db.Text to long fields that don't already have it.
  for (const f of longFields) {
    const re = new RegExp(`(^\\s*${f}\\s+String\\??(?:\\s+@default\\([^)]*\\))?)(?!.*@db\\.Text)`, "gm");
    s = s.replace(re, "$1 @db.Text");
  }
}

writeFileSync(schemaPath, s);
console.log(`schema.prisma set to ${toSqlite ? "sqlite" : "postgresql"}`);
