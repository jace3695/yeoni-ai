"use client";

import { useContext, type ReactNode } from "react";
import { CommonCharacterPlacementContext } from "./CommonCharacterContext";
import { useYeoniPreferences } from "../useYeoniPreferences";
import CommonCharacterSlot from "./CommonCharacterSlot";
import styles from "./common-character-guide.module.css";
import sizeStyles from "./common-character-size.module.css";

/** Page-owned guidance stays beside the single shared character renderer. */
export default function CommonCharacterGuide({ children, compactDesktop = true }: { children: ReactNode; compactDesktop?: boolean }) {
  const register = useContext(CommonCharacterPlacementContext);
  const preferences = useYeoniPreferences();
  return <div className={`${styles.guide} ${sizeStyles.size}`} data-yeoni-guide data-desktop-compact={compactDesktop} data-character-visible={Boolean(register && preferences.visible)}>
    <CommonCharacterSlot />
    <div className={styles.content}>{children}</div>
  </div>;
}
