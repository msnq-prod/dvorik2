# Architecture risks

## R1: Split-brain warehouse cutover — P1

Warehouse is production source of truth, but UI/scan flows still use Core legacy stock/catalog contracts. Re-enabling them would create divergent balances; hiding them without Warehouse replacements removes primary user functionality.

## R2: Scanner is capture without a domain contract — P1

ZXing can decode QR, but no product/lot/location QR schema exists. Treating arbitrary text as a barcode can corrupt identifiers.

## R3: Manual Staff data boundary — P1

Core owns identity, Staff owns employment data, yet migration/cutover and continuous identity propagation are incomplete operational boundaries.

## R4: Release evidence drift — P1

Tests and Compose describe parts of the topology but do not prove the current mandatory composition, allowing a deployable artifact with non-working workflows.

## R5: Seed confidence gap — P1

Technical checks retain two unverified opening lots; FIFO correctness cannot compensate for wrong initial physical facts.
