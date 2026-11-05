"use client";

import { usePathname } from "next/navigation";
import { isCharacterSettingsRoute } from "@/lib/yeoni/common-host-policy";
import CommonCharacterGuide from "@/components/yeoni/CommonCharacterGuide";
import AppCompanion from "@/components/AppCompanion";

export default function LanguageCompanion() {
  const path = usePathname();
  if (isCharacterSettingsRoute(path)) return null;
  return <CommonCharacterGuide><AppCompanion embedded textOnly>매일 이어가는 언어 훈련</AppCompanion></CommonCharacterGuide>;
}
