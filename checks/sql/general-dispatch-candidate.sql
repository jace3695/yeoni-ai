-- Memory-test schema evolution only. Not installed in an operating database.
ALTER TABLE yeoni_openai_general.reservations DROP CONSTRAINT reservations_state_check;
ALTER TABLE yeoni_openai_general.reservations ADD COLUMN actual_micros bigint;
ALTER TABLE yeoni_openai_general.reservations ADD CHECK(state IN ('reserved','sending','settled','uncertain'));
ALTER TABLE yeoni_openai_general.reservations ADD CHECK(
 (state='settled' AND actual_micros IS NOT NULL AND actual_micros>=0 AND actual_micros<=held_micros)
 OR (state<>'settled' AND actual_micros IS NULL));
