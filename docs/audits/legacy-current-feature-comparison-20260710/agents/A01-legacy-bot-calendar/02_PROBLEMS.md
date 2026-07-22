# A01 Problems

### P1-A01-01: Current has no production Telegram bot surface

- **Promise:** a store employee should reach schedule, stock and product actions from Telegram.
- **Reality:** current only authenticates a WebApp; the production bot/webhook is explicitly out of scope.
- **Effect:** the strongest low-friction legacy workflow disappeared.
- **Status:** confirmed.

### P1-A01-02: Current schedule lost rotation and closed-day semantics

- **Reality:** current supports manual create/update/copy and shift statuses, but no anchor rotation, workday closure or bulk future replacement.
- **Effect:** admins rebuild recurring schedules manually.
- **Status:** confirmed.

### P1-A01-03: Current swap acceptance can create a conflict

- **Reality:** `acceptSwap` replaces the employee but does not call the overlap guard for the target.
- **Effect:** a target can end up assigned to overlapping shifts.
- **Status:** confirmed by static trace; needs a regression test.

### P2-A01-04: Legacy calendar code must not be copied literally

- **Reality:** it renders 35 days, so six-row months can lose trailing dates (`keyboards.py:124-150`); auto-generation is hard-coded to 3/4 sellers and `override=True` deletes future assignments outside anchor days.
- **Effect:** literal reuse would reintroduce calendar and data-loss risks.
- **Status:** confirmed.

### P2-A01-05: Legacy schedule lacks focused tests

- **Effect:** rotation, transfer expiry and repeat-request behavior are not protected.
- **Status:** confirmed by test inventory.

