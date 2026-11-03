'use client';
import { useCallback, useContext, type ReactNode } from 'react';
import { CommonCharacterPlacementContext } from './CommonCharacterContext';
import { useYeoniPreferences } from '../useYeoniPreferences';
import styles from './common-character-slot.module.css';

/** The reply remains owned/rendered by its page, never copied into host state. */
export default function CommonCharacterSlot({ children }: { children?: ReactNode }) {
  const register = useContext(CommonCharacterPlacementContext);
  const preferences = useYeoniPreferences();
  const besideReply = children != null;
  const destination = useCallback((node: HTMLDivElement | null) => { register?.(node, besideReply); }, [register, besideReply]);
  if (!besideReply) return register ? <div ref={destination} data-yeoni-common-slot /> : null;
  return <div className={styles.layout} data-yeoni-reply-layout data-character-visible={Boolean(register && preferences.visible)}>
    {register && <div ref={destination} data-yeoni-common-slot />}
    <div className={styles.reply}>{children}</div>
  </div>;
}
