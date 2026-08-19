CREATE TABLE company_event_inbox (
  event_id TEXT PRIMARY KEY,
  producer TEXT NOT NULL,
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE company_product_profitability_projection (
  product_id TEXT PRIMARY KEY,
  actual_revenue_kopecks INTEGER NOT NULL,
  actual_cost_kopecks INTEGER NOT NULL,
  completeness TEXT NOT NULL CHECK (completeness IN ('complete','partial','unavailable')),
  source_updated_at TEXT NOT NULL,
  last_event_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX company_product_profitability_updated_idx
  ON company_product_profitability_projection(source_updated_at DESC, product_id);
