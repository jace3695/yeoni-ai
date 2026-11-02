-- REFERENCE TEMPLATE ONLY — NOT EXECUTED. No authority for another trial.
-- Existing/consumed/expired singleton must never be updated, deleted or reset.
-- Normalize creation ONCE, then derive both expiries from that exact instant.
-- Do not truncate only the evidence expiry, round up, or add a tolerance.
-- owner_id must be independently matched; never use synthetic fixtures live.
-- psql parameters below MUST be filled from real evidence, never synthetic fixtures.
-- Evidence timestamps are actual source-check/review UTC epoch milliseconds.
-- Do not replace unknown timestamps with execution time merely to pass freshness.
-- No ON CONFLICT, UPDATE, DELETE, reservation or provider dispatch.
BEGIN;
WITH timing AS (
 SELECT date_trunc('milliseconds', clock_timestamp()) AS created
), proposed AS (
 SELECT created, created + interval '15 minutes' AS expires,
 jsonb_build_object(
  'schemaVersion',1,
  'evidenceRef', :'evidence_ref',
  'approvalId','yeoni-zephyr-28-20261102',
  'requestId','bba03bc1-0ca2-46a5-8635-55ed913bd424',
  'text','안녕하세요. 연이예요. 오늘도 차근차근 함께할게요.',
  'voice','ko-KR-Chirp3-HD-Zephyr','encoding','MP3',
  'requests',1,'unit','character','quantity',28,'currency','USD',
  'sku','F977-2280-6F1B','unitPriceMicrousd',30,
  'priceSource','https://cloud.google.com/text-to-speech/pricing',
  'priceCheckedAt', :'price_checked_at_ms'::bigint,
  'taxUpperMicrousd',84,
  'taxBasisRef', :'tax_basis_ref',
  'taxCheckedAt', :'tax_checked_at_ms'::bigint,
  'feeUpperMicrousd',0,
  'feeBasisRef', :'fee_basis_ref',
  'feeCheckedAt', :'fee_checked_at_ms'::bigint,
  'additionalPaidCalls',0,'maximumMicrousd',10000,
  'reviewedAt', :'reviewed_at_ms'::bigint,
  'expiresAt',(extract(epoch from (created + interval '15 minutes'))*1000)::bigint
 ) AS evidence
 FROM timing
)
INSERT INTO public.zephyr_28_once
 (singleton,approval_id,request_id,owner_id,created_at,expires_at,execution_approved,cost_evidence,maximum_usd)
SELECT true,'yeoni-zephyr-28-20261102','bba03bc1-0ca2-46a5-8635-55ed913bd424'::uuid,
 :'owner_id'::uuid,created,expires,true,evidence,0.01
FROM proposed
WHERE public.zephyr_28_cost_valid(evidence,extract(epoch from created)*1000,extract(epoch from expires)*1000)
RETURNING approval_id,request_id,owner_id,created_at,expires_at,execution_approved,
 reserved_at,maximum_usd;
-- Require exactly one returned row. 0 means evidence rejected; stop, do not trigger UI.
COMMIT;
