-- LOCAL TEST CANDIDATE ONLY; no production migration or permission changes.
-- No approval creation endpoint. Approved=false until separately reviewed flow.
CREATE TABLE yeoni_openai_general.approvals (
 request_id text PRIMARY KEY,owner_id text NOT NULL,session_id text NOT NULL,
 disclosure jsonb NOT NULL,fingerprint text NOT NULL,
 budget_id text NOT NULL REFERENCES yeoni_openai_general.budgets(id),
 approved boolean NOT NULL DEFAULT false,issued boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL
);
