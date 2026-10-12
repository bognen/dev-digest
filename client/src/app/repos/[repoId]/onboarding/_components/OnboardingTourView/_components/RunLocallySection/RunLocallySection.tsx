"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { TourRunLocally } from "@devdigest/shared";
import { COPIED_RESET_MS } from "../../constants";
import { TourSectionCard } from "../TourSectionCard";
import { s } from "./styles";

interface CommandRowProps {
  position: number;
  command: string;
  source: string;
}

/** Commands are inert text in <code>; DevDigest never runs them (AC-20, AC-22). Copy writes exactly the command (AC-30). */
function CommandRow({ position, command, source }: CommandRowProps) {
  const t = useTranslations("onboarding");
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      /* clipboard unavailable (insecure context / denied): leave the text selectable */
    }
  };

  return (
    <li style={s.row}>
      <span style={s.index} aria-hidden="true">
        {position}
      </span>
      <div style={s.cmdWrap}>
        <code className="mono" style={s.code}>
          {command}
        </code>
        <div style={s.source}>{t("run.source", { source })}</div>
      </div>
      <span style={s.copied} role="status">
        {copied ? t("run.copied") : ""}
      </span>
      <Button
        kind="tertiary"
        size="sm"
        aria-label={t("run.copyAria", { command })}
        onClick={copy}
        icon={copied ? "Check" : "Copy"}
      />
    </li>
  );
}

export function RunLocallySection({ section }: { section: TourRunLocally }) {
  const t = useTranslations("onboarding");
  return (
    <TourSectionCard sectionKey="run_locally" state={section.state} reason={section.reason}>
      <p style={s.notice}>
        <Icon.Info size={14} />
        <span>{t("run.notice")}</span>
      </p>
      <ol style={s.list}>
        {section.steps.map((step, i) => (
          <CommandRow key={`${i}-${step.command}`} position={i + 1} command={step.command} source={step.source} />
        ))}
      </ol>
    </TourSectionCard>
  );
}
