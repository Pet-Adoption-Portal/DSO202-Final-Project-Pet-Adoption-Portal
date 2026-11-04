-- Migrations run in file-name order, once each, inside this service's own schema.
-- Never edit a migration that has been applied; add 002_..., 003_... instead.
CREATE TABLE examples (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  note        text NOT NULL DEFAULT '',
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE example_events (
  event_id    text PRIMARY KEY,
  example_id  uuid NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
