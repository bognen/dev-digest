/* Shared read-only Markdown preview of one project document (page + agent/skill tabs).
   Rendering goes through the @devdigest/ui Markdown primitive, which escapes raw HTML and strips
   javascript: URLs -- never switch this to raw HTML injection. Data comes from useProjectDoc. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import { useProjectDoc } from "@/lib/hooks/project-context";
import { s } from "./styles";

interface DocPreviewProps {
  repoId: string;
  path: string;
}

export function DocPreview({ repoId, path }: DocPreviewProps) {
  const t = useTranslations("context");
  const { data, isLoading, isError, error, refetch } = useProjectDoc(repoId, path);

  if (isLoading) {
    return (
      <div style={s.skeleton} role="status" aria-label={t("preview.loading")}>
        <Skeleton height={18} width="60%" />
        <Skeleton height={14} />
        <Skeleton height={14} />
        <Skeleton height={14} width="80%" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <ErrorState
        title={t("preview.loadError")}
        body={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <article style={s.wrap} aria-label={t("preview.label", { path: data.path })}>
      <header style={s.head}>
        <span className="mono" style={s.path}>
          {data.path}
        </span>
        <Badge mono>{data.root}</Badge>
        <Badge>{t("preview.mode")}</Badge>
        <span style={s.tokens}>{t("preview.tokens", { count: data.tokens })}</span>
      </header>
      <div style={s.body}>
        <Markdown>{data.content}</Markdown>
      </div>
    </article>
  );
}
