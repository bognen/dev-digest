import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { shortSha } from "../../helpers";
import { s } from "./styles";

interface StaleNoteProps {
  generatedSha: string;
  currentSha: string;
}

/** Shown when the repo's indexed commit moved on since the tour was generated (AC-32). Text, not colour alone. */
export function StaleNote({ generatedSha, currentSha }: StaleNoteProps) {
  const t = useTranslations("onboarding");
  return (
    <div style={s.note} role="status">
      <Icon.AlertTriangle size={14} />
      <span>{t("stale.note", { generated: shortSha(generatedSha), current: shortSha(currentSha) })}</span>
    </div>
  );
}
