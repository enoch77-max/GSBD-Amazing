-- Glowing Space BD — complete production schema.
-- Applied by the backend on boot (backend/db.ts migrate()), and safe to re-run.

-- ---------------------------------------------------------------- catalogue
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  tagline     TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image       TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT 'battery',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id                 SERIAL PRIMARY KEY,
  slug               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  brand              TEXT NOT NULL DEFAULT '',
  category_slug      TEXT NOT NULL DEFAULT '',
  short_description  TEXT NOT NULL DEFAULT '',
  description        TEXT NOT NULL DEFAULT '',
  price              INTEGER NOT NULL DEFAULT 0,
  compare_at_price   INTEGER,
  stock              INTEGER NOT NULL DEFAULT 0,
  rating             DOUBLE PRECISION NOT NULL DEFAULT 0,
  review_count       INTEGER NOT NULL DEFAULT 0,
  badge              TEXT,
  highlights         JSONB NOT NULL DEFAULT '[]',
  specs              JSONB NOT NULL DEFAULT '[]',
  images             JSONB NOT NULL DEFAULT '[]',
  featured           BOOLEAN NOT NULL DEFAULT FALSE,
  visible            BOOLEAN NOT NULL DEFAULT TRUE,
  warranty_months    INTEGER NOT NULL DEFAULT 3,
  sku                TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT products_stock_non_negative CHECK (stock >= 0),
  CONSTRAINT products_price_non_negative CHECK (price >= 0)
);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category_slug);
CREATE INDEX IF NOT EXISTS products_featured_idx ON products (featured) WHERE featured;
CREATE INDEX IF NOT EXISTS products_visible_idx ON products (visible) WHERE visible;

CREATE TABLE IF NOT EXISTS reviews (
  id           SERIAL PRIMARY KEY,
  product_slug TEXT NOT NULL,
  author       TEXT NOT NULL,
  location     TEXT NOT NULL DEFAULT 'Dhaka',
  rating       INTEGER NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  verified     BOOLEAN NOT NULL DEFAULT TRUE,
  visible      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reviews_rating_range CHECK (rating >= 1 AND rating <= 5)
);
CREATE INDEX IF NOT EXISTS reviews_product_idx ON reviews (product_slug);

-- ------------------------------------------------------------------ orders
CREATE TABLE IF NOT EXISTS orders (
  id               SERIAL PRIMARY KEY,
  order_number     TEXT NOT NULL UNIQUE,
  customer_name    TEXT NOT NULL,
  phone            TEXT NOT NULL,
  email            TEXT,
  district         TEXT NOT NULL,
  address          TEXT NOT NULL,
  notes            TEXT,
  payment_method   TEXT NOT NULL DEFAULT 'cod',
  delivery_method  TEXT NOT NULL DEFAULT 'standard',
  promo_code       TEXT,
  subtotal         INTEGER NOT NULL,
  shipping         INTEGER NOT NULL,
  discount         INTEGER NOT NULL DEFAULT 0,
  total            INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'confirmed',
  courier_provider TEXT,
  courier_consignment TEXT,
  purchase_event_id TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_phone_idx ON orders (phone);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);

CREATE TABLE IF NOT EXISTS order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id INTEGER,
  slug       TEXT NOT NULL,
  name       TEXT NOT NULL,
  image      TEXT NOT NULL DEFAULT '',
  unit_price INTEGER NOT NULL,
  qty        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);

CREATE TABLE IF NOT EXISTS order_events (
  id           SERIAL PRIMARY KEY,
  order_number TEXT NOT NULL,
  status       TEXT NOT NULL,
  label        TEXT NOT NULL,
  note         TEXT,
  actor        TEXT NOT NULL DEFAULT 'system',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events (order_number);

CREATE TABLE IF NOT EXISTS order_notes (
  id           SERIAL PRIMARY KEY,
  order_number TEXT NOT NULL,
  body         TEXT NOT NULL,
  actor        TEXT NOT NULL DEFAULT 'admin',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS order_notes_order_idx ON order_notes (order_number);

CREATE TABLE IF NOT EXISTS order_attribution (
  order_number TEXT PRIMARY KEY,
  source       TEXT NOT NULL DEFAULT 'direct',
  medium       TEXT NOT NULL DEFAULT 'none',
  campaign     TEXT,
  content      TEXT,
  term         TEXT,
  fbclid       BOOLEAN NOT NULL DEFAULT FALSE,
  gclid        BOOLEAN NOT NULL DEFAULT FALSE,
  ttclid       BOOLEAN NOT NULL DEFAULT FALSE,
  landing_page TEXT,
  referrer     TEXT,
  session_id   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------- payments
CREATE TABLE IF NOT EXISTS payments (
  id           SERIAL PRIMARY KEY,
  reference    TEXT NOT NULL UNIQUE,
  order_number TEXT NOT NULL,
  provider     TEXT NOT NULL,
  amount       INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  trx_id       TEXT,
  raw_payload  JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payments_order_idx ON payments (order_number);

-- ------------------------------------------------------- messaging & growth
CREATE TABLE IF NOT EXISTS notifications (
  id                  SERIAL PRIMARY KEY,
  channel             TEXT NOT NULL,
  recipient           TEXT NOT NULL,
  template            TEXT NOT NULL,
  subject             TEXT,
  body                TEXT NOT NULL,
  order_number        TEXT,
  status              TEXT NOT NULL DEFAULT 'queued',
  provider_message_id TEXT,
  error               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS notifications_status_idx ON notifications (status);

CREATE TABLE IF NOT EXISTS abandoned_carts (
  id            TEXT PRIMARY KEY,
  phone         TEXT NOT NULL,
  customer_name TEXT,
  items         JSONB NOT NULL,
  value         INTEGER NOT NULL,
  source        TEXT,
  campaign      TEXT,
  recovered     BOOLEAN NOT NULL DEFAULT FALSE,
  reminded_at   TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS abandoned_carts_recovery_idx ON abandoned_carts (recovered, reminded_at);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id           SERIAL PRIMARY KEY,
  code         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  order_number TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS promo_phone_idx ON promo_redemptions (code, phone);

CREATE TABLE IF NOT EXISTS promos (
  code            TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  type            TEXT NOT NULL,
  value           INTEGER NOT NULL DEFAULT 0,
  min_subtotal    INTEGER NOT NULL DEFAULT 0,
  max_discount    INTEGER,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  per_phone_limit INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT promos_type_valid CHECK (type IN ('percent', 'flat', 'shipping'))
);

CREATE TABLE IF NOT EXISTS ad_spend (
  id      SERIAL PRIMARY KEY,
  date    TEXT NOT NULL,
  channel TEXT NOT NULL,
  amount  INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ad_spend_day_channel_idx ON ad_spend (date, channel);

CREATE TABLE IF NOT EXISTS tracked_events (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  params       JSONB NOT NULL DEFAULT '{}',
  destinations TEXT[] NOT NULL DEFAULT '{}',
  session_id   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tracked_events_name_idx ON tracked_events (name, created_at DESC);

CREATE TABLE IF NOT EXISTS newsletter (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media (
  id         SERIAL PRIMARY KEY,
  path       TEXT NOT NULL UNIQUE,
  mime       TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------- operations
CREATE TABLE IF NOT EXISTS settings (
  id         SMALLINT PRIMARY KEY DEFAULT 1,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT settings_singleton CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS admin_users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_users_role_valid CHECK (role IN ('owner', 'staff'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         SERIAL PRIMARY KEY,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  target     TEXT,
  payload    JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log (created_at DESC);

CREATE TABLE IF NOT EXISTS blocklist (
  phone      TEXT PRIMARY KEY,
  reason     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
