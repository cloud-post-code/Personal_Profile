# Feature — Deleting content removes its claims from the graph

## Why
Deleting a source, project, photo or approved answer removes its `Chunk` rows
(and `EntityMention` with them), but the `Entity` and `EntityEdge` rows the
extraction pass produced **survive forever**. Nothing records which origin
produced them, so nothing can clean them up.

That is not just untidy — deleted content still speaks. `retrieve()` does not
reach entities through chunks: it loads **every** entity and seeds on any whose
key appears in the raw query, then renders that entity's edges into the system
prompt as `KNOWN RELATIONSHIPS`. So after deleting the source that asserted it,
the chatbot can still state `Blake — leads → NANDA SMB Agentic Commerce
Initiative` as fact, with no chunk left to support it. Deleting content is
supposed to be the admin's retraction mechanism, and today it only half works.

`graphStats` already reports `orphanEntities`, so the debris is visible in the
Graph tab. This makes it removable.

## What
Record **which origin asserted each extracted relation**, so a delete can
retract exactly that origin's claims.

### Ownership rules
| Row | Owned by | Removed when |
|---|---|---|
| `EntityEdge` from extraction | every origin that asserted it | its last asserting origin is deleted or re-indexed away |
| `EntityEdge` added by hand on the Graph tab | nobody | only by explicit delete on the Graph tab |
| `Entity` | its mentions + its edges | it has no mentions **and** no edges left |

Cross-origin dedup stays exactly as it is: two origins naming the same thing
still converge on one `Entity`, and an edge both assert is owned by both. It
disappears only when the last owner goes.

### Untracked edges are never auto-pruned
An edge with no recorded owner is left alone. This covers both admin-authored
relations and every edge written before this feature existed, so shipping the
change cannot silently empty an existing graph. Only an edge whose ownership was
recorded, and then fully removed, is deleted.

## Boundaries
- Provenance is per `(edge, originKind, originId)`; deleting an origin removes
  its rows, and an edge with none left is deleted.
- `dropOrigin` becomes the single cleanup path — every delete already routes
  through it or through the `Source → Chunk` cascade.
- Re-indexing an origin re-asserts its claims; it must not drop another
  origin's ownership of a shared edge.
- Renaming/merging an entity on the Graph tab must carry ownership onto the
  rewired edges, or a later delete would miss them.
- `prisma/schema.prisma` stays `provider = "postgresql"` (Railway deploys from
  it). The migration runs locally only; production is applied separately.
- Existing rows carry no ownership until a reindex re-asserts it.
- No change to chunking, embedding, ranking, or one-hop expansion.

## Scenarios
- Blake deletes the NANDA source. Its chunks, its entities, and the relations it
  asserted are all gone; asking the chatbot about NANDA yields nothing, and the
  Graph tab shows no NANDA node.
- The same entity is named by a project write-up *and* a source. Deleting the
  source keeps the entity and any relation the project also asserts.
- Blake adds a relation by hand on the Graph tab, then deletes an unrelated
  source. His relation survives.
- Blake un-approves a 👍 answer. Same retraction as a delete.
- Re-saving a project re-asserts its relations without disturbing a source that
  shares them.

## Acceptance
- After deleting an origin, no entity or relation that only it supported
  remains, and `retrieve()` emits none of its relations.
- An entity or relation still backed by another origin survives that delete.
- A hand-added relation survives deletes of any origin.
- Adding then deleting a source returns entity/edge/chunk counts to their
  pre-add baseline.
- Re-indexing one origin leaves another origin's ownership intact.

## Implementation Routing
- Required skills: coding-proof-author, coding-frontend
