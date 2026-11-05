"use client";

import { useContext, useLayoutEffect } from "react";
import { CommonCharacterSuppressionContext } from "./CommonCharacterContext";

export default function CommonCharacterSuspension({ active }: { active: boolean }) {
  const suppress = useContext(CommonCharacterSuppressionContext);
  useLayoutEffect(() => { if (active && suppress) return suppress(); }, [active, suppress]);
  return null;
}
