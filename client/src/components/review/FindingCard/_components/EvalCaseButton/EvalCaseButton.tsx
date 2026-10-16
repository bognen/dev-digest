/* EvalCaseButton — "Turn into eval case" on a finding (SPEC-06 AC-1/2/5/6/62).
   One click: accepted → must_find case, dismissed → must_not_flag case. Disabled
   with a hint until the finding is decided; shows "Eval case ✓" once a case exists. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { useCreateCaseFromFinding, useEvalCaseSources } from "@/lib/hooks/eval";
import { notify } from "@/lib/toast";

export function EvalCaseButton({ f }: { f: FindingRecord }) {
  const t = useTranslations("prReview");
  const sources = useEvalCaseSources();
  const create = useCreateCaseFromFinding();
  const decided = !!f.accepted_at || !!f.dismissed_at;
  const exists = !!sources.data?.includes(f.id);

  const label = create.isPending ? t("finding.evalCreating") : exists ? t("finding.evalExists") : t("finding.evalTurnInto");

  return (
    <Button
      kind="ghost"
      size="sm"
      icon="FlaskConical"
      disabled={!decided || create.isPending}
      active={exists}
      title={decided ? undefined : t("finding.evalDecideFirst")}
      onClick={() =>
        create.mutate(f.id, {
          onSuccess: (res) => {
            const name = res.case.name;
            notify.success(
              res.note ? t("finding.evalCreatedNote", { name, note: res.note }) : t("finding.evalCreated", { name }),
            );
          },
          onError: (err) => notify.error((err as Error).message),
        })
      }
    >
      {label}
    </Button>
  );
}
