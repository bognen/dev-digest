import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { OnboardingTourProvenance } from "@devdigest/shared";
import { statusKey } from "../../helpers";

/** Honest status in text (AC-26, NFR-6c): "Generated", or "Skeleton — <reason>[: detail]". Colour is secondary. */
export function TourStatusBadge({ provenance }: { provenance: OnboardingTourProvenance }) {
  const t = useTranslations("onboarding");
  const generated = provenance.status === "generated";
  const label = t(`status.${statusKey(provenance)}`);
  const text = provenance.skeleton_detail ? t("status.detail", { label, detail: provenance.skeleton_detail }) : label;
  return (
    <span aria-label={`${t("status.label")}: ${text}`}>
      <Badge
        icon={generated ? "CheckCircle" : "AlertTriangle"}
        color={generated ? "var(--ok)" : "var(--warn)"}
        style={{ whiteSpace: "normal" }}
      >
        {text}
      </Badge>
    </span>
  );
}
