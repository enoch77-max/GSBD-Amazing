-- Customer features and hardening for pack builds and social proof.

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS helpful_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pack_spec JSONB;

CREATE TABLE IF NOT EXISTS review_votes (
  id           SERIAL PRIMARY KEY,
  review_id    INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  voter_hash   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT review_votes_unique_voter UNIQUE (review_id, voter_hash)
);
CREATE INDEX IF NOT EXISTS review_votes_review_idx ON review_votes (review_id);

-- A repeated browser purchase event cannot create two orders during a retry.
CREATE UNIQUE INDEX IF NOT EXISTS orders_purchase_event_unique
  ON orders (purchase_event_id) WHERE purchase_event_id IS NOT NULL;
