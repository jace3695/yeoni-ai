-- LOCAL SYNTHETIC CANDIDATE ONLY. Not a production migration.
-- No privileges or approval creation endpoint are installed.
ALTER TABLE yeoni_openai_general.approvals ADD COLUMN legacy_binding jsonb;
ALTER TABLE yeoni_openai_general.grants ADD COLUMN legacy_binding jsonb;
