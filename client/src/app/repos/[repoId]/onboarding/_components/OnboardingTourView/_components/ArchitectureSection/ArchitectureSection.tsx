"use client";

import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { TourArchitecture } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { TourSectionCard } from "../TourSectionCard";
import { s } from "./styles";

interface ArchitectureSectionProps {
  section: TourArchitecture;
  transformHref: (href: string) => string | null;
}

export function ArchitectureSection({ section, transformHref }: ArchitectureSectionProps) {
  const t = useTranslations("onboarding");
  // A generated tour shows only the summary + diagram (design); the deterministic
  // Stack/Structure/Routes lists are the fallback when there is no narrative (AC-25).
  const hasNarrative = section.state !== "requires_generation" && !!section.summary_markdown;
  return (
    <TourSectionCard sectionKey="architecture" state={section.state} reason={section.reason}>
      {hasNarrative ? (
        <>
          <div style={s.prose}>
            <Markdown transformHref={transformHref}>{section.summary_markdown ?? ""}</Markdown>
          </div>
          {section.diagram && <MermaidDiagram chart={section.diagram} />}
        </>
      ) : null}

      {!hasNarrative && section.stack.length > 0 && (
        <>
          <h3 style={s.subheading}>{t("architecture.stack")}</h3>
          <ul style={s.list}>
            {section.stack.map((item) => (
              <li key={item.name}>
                <strong style={s.strong}>{item.name}</strong> <span style={s.muted}>{item.evidence}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {!hasNarrative && section.structure.length > 0 && (
        <>
          <h3 style={s.subheading}>{t("architecture.structure")}</h3>
          <ul style={s.list}>
            {section.structure.map((item) => (
              <li key={item.path}>
                <span className="mono">{item.path}</span>{" "}
                <span style={s.muted}>{t("architecture.files", { count: item.files })}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {!hasNarrative && section.routes.length > 0 && (
        <>
          <h3 style={s.subheading}>{t("architecture.routes")}</h3>
          <ul style={s.list}>
            {section.routes.map((route) => (
              <li key={route} className="mono">
                {route}
              </li>
            ))}
          </ul>
        </>
      )}
    </TourSectionCard>
  );
}
