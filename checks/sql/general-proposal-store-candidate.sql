-- Local fixture only; not an authorized production migration.
CREATE TABLE yeoni_openai_general.proposals (
 request_id text PRIMARY KEY,owner_id text NOT NULL,session_id text NOT NULL,
 fingerprint text NOT NULL,proposal jsonb NOT NULL,expires_at timestamptz NOT NULL,
 consumed boolean NOT NULL DEFAULT false
);
