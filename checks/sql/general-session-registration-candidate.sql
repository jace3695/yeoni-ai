-- LOCAL TEST ONLY; do not install in production without separate authorization.
CREATE SEQUENCE yeoni_openai_general.session_epoch_sequence MINVALUE 1 MAXVALUE 9007199254740991 NO CYCLE;
-- Existing rows must be reviewed; collisions fail instead of reusing an epoch.
-- Sequence seeding is not automatic.
ALTER TABLE yeoni_openai_general.session_epochs ADD CONSTRAINT session_owner_epoch_unique UNIQUE(owner_id,epoch);
