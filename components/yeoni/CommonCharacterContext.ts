'use client';
import { createContext, useContext } from 'react';
import type { CharacterControlProps } from './useCharacterStage';
export const CHARACTER_RESET_EVENT = 'yeoni-character-reset';
export type CharacterChannel = { publish(controls: CharacterControlProps): () => void; requestQuiet(): () => void };
export const CommonCharacterContext = createContext<CharacterChannel | null>(null);
export const useCommonCharacterHost = () => useContext(CommonCharacterContext);

/** Explicit document-flow destination owned by the current page layout. */
export const CommonCharacterPlacementContext = createContext<((node: HTMLDivElement | null, besideReply?: boolean) => void) | null>(null);

/** Ephemeral leases for in-page settings tabs; never changes saved preferences. */
export const CommonCharacterSuppressionContext = createContext<(() => () => void) | null>(null);
