"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, useFindingAction, useSmartDiff } from "@/lib/hooks";
import { notify } from "@/lib/toast";
import type { FindingRecord, PrFile, ReviewRecord } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { OrderToggle, type DiffOrder } from "./_components/OrderToggle";
import { RoleGroup } from "./_components/RoleGroup";
import { hasOpenFinding, latestOpenFindingsByPath, mergeSmartOrder, toAnchors } from "./helpers";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** PR head sha — keys the smart-diff query and deep-links finding files. */
  headSha?: string | null;
  /** Persisted review runs (newest first) — source of the inline findings. */
  reviews?: ReviewRecord[];
  repoFullName?: string | null;
}

export function DiffTab({ prId, filesCount, files, canComment, headSha, reviews, repoFullName }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: smartDiff } = useSmartDiff(prId, headSha);
  const action = useFindingAction();
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  const [order, setOrder] = React.useState<DiffOrder>("smart");

  const commentCount = comments?.length ?? 0;

  const findingsByPath = React.useMemo(() => latestOpenFindingsByPath(reviews ?? []), [reviews]);
  const findingsById = React.useMemo(() => {
    const m = new Map<string, FindingRecord>();
    for (const list of findingsByPath.values()) for (const f of list) m.set(f.id, f);
    return m;
  }, [findingsByPath]);

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const findings: DiffFindingApi = {
    anchorsFor: (path) => toAnchors(findingsByPath.get(path)),
    hasOpenFindings: (path) => hasOpenFinding(findingsByPath.get(path)),
    renderFinding: (id) => {
      const f = findingsById.get(id);
      if (!f) return null;
      return (
        <FindingCard
          f={f}
          defaultExpanded
          pending={action.isPending}
          repoFullName={repoFullName}
          headSha={headSha}
          onAction={(a) => action.mutate({ findingId: f.id, action: a, prId: prId ?? undefined })}
        />
      );
    },
  };

  // Smart order needs the smart-diff; while it loads/errors fall back to original.
  const groups = React.useMemo(() => (smartDiff ? mergeSmartOrder(files, smartDiff) : null), [files, smartDiff]);
  const split = smartDiff?.split_suggestion;

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          commentCount > 0 ? (
            <Button
              kind="ghost"
              size="sm"
              icon={showComments ? "EyeOff" : "Eye"}
              onClick={() => setShowComments((v) => !v)}
            >
              {showComments ? "Hide comments" : "Show comments"} ({commentCount})
            </Button>
          ) : undefined
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      {split?.too_big && (
        <div role="note" style={s.notice}>
          <div style={s.noticeTitle}>{t("smartDiff.largeTitle", { lines: split.total_lines })}</div>
          <div style={s.noticeBody}>{t("smartDiff.largeBody")}</div>
          <ul style={s.noticeList}>
            {split.proposed_splits.map((p) => (
              <li key={p.name}>
                {p.name} ({t("smartDiff.filesCount", { count: p.files.length })})
              </li>
            ))}
          </ul>
        </div>
      )}
      {groups && (
        <div style={s.controls}>
          <span style={s.hint}>{order === "smart" ? t("smartDiff.reviewerOrderedDiff") : ""}</span>
          <OrderToggle order={order} onChange={setOrder} />
        </div>
      )}
      {groups && order === "smart" ? (
        <div style={s.groups}>
          {groups.map((g) => (
            <RoleGroup key={g.role} group={g} commenting={commenting} findings={findings} />
          ))}
        </div>
      ) : (
        <DiffViewer files={files} commenting={commenting} findings={findings} />
      )}
    </section>
  );
}
