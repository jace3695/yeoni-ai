'use client';
import { useContext } from 'react';
import { CommonCharacterPlacementContext } from './CommonCharacterContext';

/** Place once below the page header; no auth, records or playback work. */
export default function CommonCharacterSlot() {
  const register = useContext(CommonCharacterPlacementContext);
  return register ? <div ref={register} data-yeoni-common-slot /> : null;
}
