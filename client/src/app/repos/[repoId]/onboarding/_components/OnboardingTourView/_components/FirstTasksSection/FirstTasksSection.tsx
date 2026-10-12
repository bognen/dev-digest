"use client";

import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { TourFirstTasks } from "@devdigest/shared";
import { OpenLink } from "../OpenLink";
import { TourSectionCard } from "../TourSectionCard";
import { s } from "./styles";

interface FirstTasksSectionProps {
  section: TourFirstTasks;
  fullName: string | undefined;
  sha: string | undefined;
  transformHref: (href: string) => string | null;
}

export function FirstTasksSection({ section, fullName, sha, transformHref }: FirstTasksSectionProps) {
  const t = useTranslations("onboarding");
  return (
    <TourSectionCard sectionKey="first_tasks" state={section.state} reason={section.reason}>
      {section.items.length > 0 && (
        <ol style={s.list}>
          {section.items.map((task, i) => (
            <li key={`${i}-${task.title}`} style={s.task}>
              <h3 style={s.title}>{task.title}</h3>
              <div style={s.rationale}>
                <Markdown transformHref={transformHref}>{task.rationale}</Markdown>
              </div>
              {task.files.length > 0 && (
                <ul style={s.files} aria-label={t("tasks.files")}>
                  {task.files.map((file) => (
                    <li key={file} style={s.file}>
                      <span className="mono" style={s.path}>
                        {file}
                      </span>
                      <OpenLink path={file} fullName={fullName} sha={sha} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </TourSectionCard>
  );
}
