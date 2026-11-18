-- LOCAL SYNTHETIC CANDIDATE ONLY. No production migration/permissions.
-- Production insert-only reviewed approval lifecycle is NOT implemented.
CREATE TABLE yeoni_openai_general.quote_snapshots (
 quote_id text PRIMARY KEY,request_id text NOT NULL UNIQUE,owner_id text NOT NULL,
 epoch bigint NOT NULL,grant_id text NOT NULL,approval_id text NOT NULL,fingerprint text NOT NULL,
 organization text NOT NULL,project text NOT NULL,model text NOT NULL,pricing_version text NOT NULL,
 currency text NOT NULL CHECK(currency='USD'),max_cost_micros bigint NOT NULL CHECK(max_cost_micros>0),
 input_micros_per_million bigint NOT NULL CHECK(input_micros_per_million>0),
 output_micros_per_million bigint NOT NULL CHECK(output_micros_per_million>0),
 max_prompt_tokens bigint NOT NULL CHECK(max_prompt_tokens>0),max_output_tokens integer NOT NULL CHECK(max_output_tokens>0 AND max_output_tokens<=2048)
);
-- Defense in depth in candidate schema; only INSERT is part of lifecycle.
CREATE FUNCTION yeoni_openai_general.reject_quote_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'QUOTE_SNAPSHOT_IMMUTABLE'; END $$;
CREATE TRIGGER immutable_quote_snapshot BEFORE UPDATE OR DELETE ON yeoni_openai_general.quote_snapshots
FOR EACH ROW EXECUTE FUNCTION yeoni_openai_general.reject_quote_mutation();
