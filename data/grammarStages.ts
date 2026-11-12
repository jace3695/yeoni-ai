import { BEGINNER_ORDER } from './grammarBeginnerGuide.ts';

// Existing ga-particle keeps its original subject/new-information topic and history.
export const BRIDGE_ORDER = ['no-particle', 'mo-particle', 'nan', 'doko', 'masen', 'mashita', 'ga-suki'];
export const TRAVEL_ORDER = ['time-on-hour', 'price-yen', 'place-arimasu', 'place-imasu', 'noun-kudasai', 'quantity-hitotsu'];
export const GUIDED_GRAMMAR_ORDER = [...BEGINNER_ORDER, ...BRIDGE_ORDER, ...TRAVEL_ORDER];
export type GuidedGrammarStage = 'foundation' | 'bridge' | 'travel';
export const GRAMMAR_STAGE_ORDER: Record<GuidedGrammarStage, string[]> = {
  foundation: BEGINNER_ORDER,
  bridge: BRIDGE_ORDER,
  travel: TRAVEL_ORDER,
};

export function isGuidedGrammarStage(value: string): value is GuidedGrammarStage {
  return Object.hasOwn(GRAMMAR_STAGE_ORDER, value);
}
