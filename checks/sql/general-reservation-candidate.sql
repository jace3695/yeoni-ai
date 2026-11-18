-- LOCAL TEST CANDIDATE ONLY. No roles, policies, functions or production installation.
-- Approval issuance is deliberately absent. Rows must come from reviewed server authority.
CREATE SCHEMA yeoni_openai_general;
CREATE TABLE yeoni_openai_general.budgets (
 id text PRIMARY KEY, owner_id text NOT NULL, organization text NOT NULL, project text NOT NULL,
 currency text NOT NULL CHECK(currency='USD'), cap_micros bigint NOT NULL CHECK(cap_micros>0 AND cap_micros<=9007199254740991),
 held_micros bigint NOT NULL DEFAULT 0 CHECK(held_micros>=0 AND held_micros<=cap_micros),
 enabled boolean NOT NULL DEFAULT false, expires_at timestamptz NOT NULL
);
CREATE TABLE yeoni_openai_general.grants (
 request_id text PRIMARY KEY, owner_id text NOT NULL, session_id text NOT NULL, fingerprint text NOT NULL,
 organization text NOT NULL, project text NOT NULL, currency text NOT NULL CHECK(currency='USD'),
 max_cost_micros bigint NOT NULL CHECK(max_cost_micros>0 AND max_cost_micros<=9007199254740991),
 budget_id text NOT NULL REFERENCES yeoni_openai_general.budgets(id),
 consumed boolean NOT NULL DEFAULT false, expires_at timestamptz NOT NULL
);
CREATE TABLE yeoni_openai_general.reservations (
 request_id text PRIMARY KEY REFERENCES yeoni_openai_general.grants(request_id),
 owner_id text NOT NULL, session_id text NOT NULL, budget_id text NOT NULL REFERENCES yeoni_openai_general.budgets(id),
 fingerprint text NOT NULL, held_micros bigint NOT NULL CHECK(held_micros>0 AND held_micros<=9007199254740991),
 state text NOT NULL CHECK(state='reserved')
);
