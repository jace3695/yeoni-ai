-- LOCAL TEST CANDIDATE ONLY; no production auth lifecycle or permission changes.
CREATE TABLE yeoni_openai_general.session_epochs (
 owner_id text NOT NULL,session_id text NOT NULL,epoch bigint NOT NULL CHECK(epoch>=0 AND epoch<=9007199254740991),
 active boolean NOT NULL DEFAULT false,expires_at timestamptz NOT NULL,
 PRIMARY KEY(owner_id,session_id)
);
