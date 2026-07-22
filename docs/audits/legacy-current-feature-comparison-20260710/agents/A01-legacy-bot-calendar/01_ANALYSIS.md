# A01 Analysis — Legacy Bot And Calendar

## Confirmed strengths

1. **The legacy calendar is a real Telegram workflow, not just authentication.** `/sched` opens an inline month calendar, supports month navigation, a day view and a two-month report (`recovered-dvorik/app/handlers/schedule.py:27-38`, `55-91`). Current explicitly excludes production bot webhooks (`gpt-version/README.md:50-52`).
2. **The employee sees personal context immediately.** Calendar cells mark the employee's workdays with `✅` and closed days with `✖`; navigation and report action remain in the same message (`recovered-dvorik/app/ui/keyboards.py:104-160`).
3. **A day is actionable.** The bot shows who works, who is free, offers valid replacement targets, and gives admins add/remove/open-close/swap actions (`recovered-dvorik/app/handlers/schedule.py:172-216`).
4. **Substitution is an end-to-end conversation.** The target receives Accept/Decline/Preview buttons; acceptance revalidates that exactly one party is still assigned and applies the replacement atomically (`recovered-dvorik/app/handlers/schedule.py:231-321`, `recovered-dvorik/app/services/schedule.py:414-495`).
5. **The system can generate a rotation.** It derives 2/1 rotation for three sellers or 2/2 for four sellers from two anchor days and can generate 30 days (`recovered-dvorik/app/services/schedule.py:158-281`, `287-408`; `recovered-dvorik/app/handlers/schedule.py:516-631`).
6. **Schedule distribution is built in.** PNG/PDF/HTML reports for two months are produced and sent in Telegram (`recovered-dvorik/app/handlers/schedule.py:66-91`, `348-371`; `recovered-dvorik/app/services/schedule_report.py:29-147`).
7. **The bot covers daily store work.** Inline FTS search returns stock summaries and opens a product card (`recovered-dvorik/app/handlers/inline.py:14-119`); cards can show local photos and direct movement/write-off actions (`recovered-dvorik/app/handlers/product.py:24-61`, `recovered-dvorik/app/ui/cards.py:12-46`).
8. **Registration is self-service.** Unknown users submit name/surname; admins approve seller/admin role in Telegram and the user is notified (`recovered-dvorik/app/handlers/core.py:11-37`, `recovered-dvorik/app/handlers/registration.py:67-148`, `151-230`).
9. **Notifications are delivered, not merely stored.** Per-admin modes `off/daily/instant` exist for zero stock, last pack and receipts; the daily digest is sent at 21:10 (`recovered-dvorik/app/services/notify.py:13-75`, `102-216`; `recovered-dvorik/app/main.py:45-79`).

## Current comparison

- Current has a stronger web month view, location filtering, shift statuses and permissions (`gpt-version/src/client/src/pages/SchedulePage.tsx:17-86`, `204-256`).
- Current has no bot command/menu/webhook/delivery surface; Telegram is used only to validate WebApp `initData` (`gpt-version/src/server/index.ts:254-276`, `gpt-version/README.md:50-52`).
- Current swap UI and API exist, but acceptance replaces the employee without checking whether the target already has a conflicting shift on that date (`gpt-version/src/server/domain.ts:966-986`). Legacy's exactly-one-assigned rule is safer for this scenario.

## Evidence limits

- The bot could not be captured live because no audit Telegram token/chat was available. Bot conclusions are code-backed, not screenshot-backed.
- No schedule-focused legacy tests were found under `recovered-dvorik/tests`.

