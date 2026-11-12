"use client";

import LocalRecordGuidance from "@/components/yeoni/LocalRecordGuidance";
import { usePathname } from "next/navigation";
import { isCharacterSettingsRoute } from "@/lib/yeoni/common-host-policy";
import CommonCharacterGuide from "@/components/yeoni/CommonCharacterGuide";
import AppCompanion from "@/components/AppCompanion";

export default function LanguageCompanion() {
  const path = usePathname();
  if (isCharacterSettingsRoute(path)) return null;
  return <CommonCharacterGuide><AppCompanion embedded textOnly><LocalRecordGuidance app="language" languagePath={path ?? undefined} /></AppCompanion></CommonCharacterGuide>;
}
