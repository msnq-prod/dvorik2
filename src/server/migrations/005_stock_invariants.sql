CREATE UNIQUE INDEX IF NOT EXISTS stock_operations_reversal_unique
  ON stock_operations(reversed_operation_id)
  WHERE reversed_operation_id IS NOT NULL;
