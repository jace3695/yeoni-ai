import { MockReplyLedger, MockRecordReplyService, type MockTransport, type SourceSnapshot, type Outcome } from './generated-record-reply.ts';
/** User-chosen monthly targets; these do not enable a provider or billing. */
export const REPLY_BUDGET_TARGETS_KRW = Object.freeze({ analysis: 7000, voice: 3000 });
// Initial MOCK planning margin, not a promise about any provider invoice.
export const MOCK_HEADROOM_RATIO = 0.2;
export function mockSpendableKrw(kind: keyof typeof REPLY_BUDGET_TARGETS_KRW) {
  return Math.floor(REPLY_BUDGET_TARGETS_KRW[kind] * (1 - MOCK_HEADROOM_RATIO));
}
/** Input must already cover quoted FX/tax/max-output uncertainty; missing quote blocks. */
export function conservativeReservationKrw(allInUpperEstimate: number | null): number | null {
  return allInUpperEstimate !== null && Number.isFinite(allInUpperEstimate) && allInUpperEstimate > 0 ? Math.ceil(allInUpperEstimate * 1.1) : null;
}
export function createMockReplyBudgets() {
  // Separate pools; unused voice budget cannot subsidize analysis and vice versa.
  // No automatic month reset: until billing timezone/reconciliation is chosen,
  // unresolved reservations are retained even at a calendar boundary.
  return { analysis: new MockReplyLedger(mockSpendableKrw('analysis')), voice: new MockReplyLedger(mockSpendableKrw('voice')) };
}

/** Budgeted mock entry point. Generic service unit fixtures use abstract costs. */
export function createQuotedMockReplyService(kind: keyof typeof REPLY_BUDGET_TARGETS_KRW, book: ReturnType<typeof createMockReplyBudgets>, transport: MockTransport) {
  const service = new MockRecordReplyService(book[kind], transport);
  return { async analyze(source: SourceSnapshot, analysisDate: string, now: string, allInUpperEstimate: number | null): Promise<Outcome> {
    const cost = conservativeReservationKrw(allInUpperEstimate);
    if (cost === null) {
      const scope = book[kind].scope(source.owner, source.app);
      book[kind].observe(scope); book[kind].select(scope, 'quote-unavailable');
      return { status: 'budget' };
    }
    return service.analyze(source, analysisDate, now, cost);
  } };
}
