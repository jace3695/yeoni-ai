import { BEGINNER_ORDER } from './grammarBeginnerGuide.ts';

// Existing ga-particle keeps its original subject/new-information topic and history.
export const BRIDGE_ORDER = ['no-particle', 'mo-particle', 'nan', 'doko', 'masen', 'mashita', 'ga-suki'];
export const GUIDED_GRAMMAR_ORDER = [...BEGINNER_ORDER, ...BRIDGE_ORDER];
export type GuidedGrammarStage = 'foundation' | 'bridge';
export const GRAMMAR_STAGE_ORDER: Record<GuidedGrammarStage, string[]> = {
  foundation: BEGINNER_ORDER,
  bridge: BRIDGE_ORDER,
};
