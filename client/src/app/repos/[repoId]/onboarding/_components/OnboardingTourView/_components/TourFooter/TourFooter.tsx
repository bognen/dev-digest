import { useTranslations } from "next-intl";
import type { OnboardingTourProvenance } from "@devdigest/shared";
import { formatCost, formatTokens } from "@/lib/format";
import { s } from "./styles";

/** Optional model / tokens / cost footer (AC-37). Each part only when the value is known. */
export function TourFooter({ provenance }: { provenance: OnboardingTourProvenance }) {
  const t = useTranslations("onboarding");
  const parts: string[] = [];
  if (provenance.model) parts.push(t("footer.model", { model: provenance.model }));
  if (provenance.tokens_in !== null && provenance.tokens_out !== null) {
    parts.push(t("footer.tokens", { tokens: formatTokens(provenance.tokens_in, provenance.tokens_out) }));
  }
  if (provenance.cost_usd !== null) parts.push(t("footer.cost", { cost: formatCost(provenance.cost_usd) }));
  if (parts.length === 0) return null;
  return (
    <footer className="mono" style={s.footer}>
      {parts.join(" · ")}
    </footer>
  );
}
