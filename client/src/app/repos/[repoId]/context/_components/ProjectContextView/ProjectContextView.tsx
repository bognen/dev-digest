/* /repos/:repoId/context - Project Context (view-only). Lists the repo's specs/docs/insights
   Markdown files from the synced checkout, previews the selected one and offers a refresh
   (git sync). No editing, uploading or creating (non-goals of SPEC-01). */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { DocPreview } from "@/components/project-context/DocPreview";
import { ApiError } from "@/lib/api";
import { useProjectDocs, useRefreshProjectDocs } from "@/lib/hooks/project-context";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { DocList } from "./_components/DocList";
import { CHECKOUT_UNAVAILABLE, SKELETON_ROWS } from "./constants";
import { s } from "./styles";

export function ProjectContextView() {
  const t = useTranslations("context");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data, isLoading, isError, error, refetch } = useProjectDocs(repoId);
  const refresh = useRefreshProjectDocs();
  const [selected, setSelected] = React.useState<string | null>(null);

  const crumb = [{ label: t("title") }];
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const docs = data?.docs ?? [];
  // Derived: a selection that vanished after a refresh falls back to "nothing selected".
  const selectedPath = docs.some((d) => d.path === selected) ? selected : null;
  const repoName = activeRepo?.full_name ?? t("repoFallback");

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div role="status" aria-label={t("loading")}>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <Skeleton key={i} height={44} style={s.skeletonRow} />
        ))}
      </div>
    );
  } else if (isError) {
    const unavailable = error instanceof ApiError && error.code === CHECKOUT_UNAVAILABLE;
    body = (
      <ErrorState
        title={unavailable ? t("checkoutUnavailable") : t("loadError")}
        body={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
      />
    );
  } else if (docs.length === 0) {
    body = <EmptyState icon="FileText" title={t("empty.title")} body={t("empty.body")} />;
  } else {
    body = (
      <div style={s.columns}>
        <DocList docs={docs} selectedPath={selectedPath} onSelect={setSelected} />
        <div style={s.previewPane}>
          {selectedPath ? (
            <DocPreview repoId={repoId} path={selectedPath} />
          ) : (
            <div style={s.placeholder}>{t("selectPrompt")}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.headerRow}>
          <h1 style={s.heading}>{t("title")}</h1>
          <Button
            icon="RefreshCw"
            onClick={() => refresh.mutate(repoId)}
            loading={refresh.isPending}
            disabled={refresh.isPending}
          >
            {refresh.isPending ? t("refreshing") : t("refresh")}
          </Button>
        </div>
        <p style={s.subtitle}>{t("subtitle", { repo: repoName })}</p>
        {refresh.isError && !refresh.isPending && (
          <div style={s.refreshError} role="alert">
            <strong>{t("refreshFailed")}</strong>
            <div>{refresh.error instanceof Error ? refresh.error.message : ""}</div>
          </div>
        )}
        {body}
      </div>
    </AppShell>
  );
}
