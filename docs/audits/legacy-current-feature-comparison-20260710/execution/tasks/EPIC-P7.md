# EPIC-P7 — Staged release

## Статус

- `done`; P0; dependency `EPIC-P6`.

## Цель

Produce a repeatable staged-release package with automatic rollback thresholds,
without claiming an external cutover that has no supplied target or secrets.

## Checkpoint

- immutable built-artifact smoke verifies server, UI and migrations;
- fresh production database migrates before listen and `/ready` is green;
- dry-run is non-mutating; media and backup paths cannot overlap;
- current runbook defines backup, readonly/reversible-write/worker smoke,
  restricted access, hypercare and rollback thresholds.
