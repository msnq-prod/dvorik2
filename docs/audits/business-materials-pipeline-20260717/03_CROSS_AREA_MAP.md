# Cross-Area Map

## Failure chain

| Upstream failure | Propagation | Downstream effect |
|---|---|---|
| Wrong `current` root and false Inventory Gate | Only 4 processes enter the catalog | Telegram, database, roles, jobs, integrations and most application workflows disappear |
| Unsupported/unknown claims pass as covered | Learning accepts incomplete cards | Planned, legacy, unknown and current behavior become unsafe teaching inputs |
| Learning replaces meaning with `claim_*` references | Storyboards receive no actionable text | Visual stage can only create placeholders |
| One fictitious `aud_all_staff` audience | Every process is sent to everybody | No role-specific entry point, responsibility or escalation path exists |
| Storyboard uses “see source material” placeholder | Composer repeats generic copy | Four 20-slide decks are semantically empty |
| Self-review and structural coverage pass | Handoffs carry no local gaps | Pipeline declares delivery despite failure of the user objective |

## Shared source-of-truth conflicts

- `gpt-version/docs/PROJECT_STATE.md` identifies `gpt-version` as current, while
  the analysis treats root `server/routes.ts` as current.
- `docs/crm/` and `dvorik-docs-staging/docs/webapp-rebuild/` both act as target
  sources without an explicit authority order.
- Machine statuses describe graph closure; client-facing readiness requires
  semantic and usability gates that do not exist.

## Shared state owners that are missing

- roles and permissions;
- database aggregates and state transitions;
- Telegram entrypoints and notifications;
- background jobs, outbox, retries and reversals;
- current/legacy/target lifecycle disposition;
- independent reviewer identity and model/run provenance.

## Deduplicated systemic findings

1. Objective completeness is not part of any stage gate.
2. Structural traceability is mistaken for semantic fidelity.
3. Unknowns and gaps are allowed to disappear downstream.
4. Author self-review is recorded as passed QA.
5. Client delivery is based on file existence and hashes, not task usability.

