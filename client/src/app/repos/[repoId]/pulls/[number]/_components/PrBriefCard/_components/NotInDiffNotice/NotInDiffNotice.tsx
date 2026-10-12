/* NotInDiffNotice — inline notice shown next to a brief reference that is not
   among the PR's changed files. The optional external link is built by the
   caller from the existing githubBlobUrl, never from a raw brief string. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MonoLink } from "@devdigest/ui";
import { s } from "./styles";

export function NotInDiffNotice({ externalHref }: { externalHref?: string }) {
  const t = useTranslations("brief");
  return (
    <span style={s.notice}>
      <span role="status">{t("navigation.notInDiff")}</span>
      {externalHref && <MonoLink href={externalHref}>{t("navigation.openExternal")}</MonoLink>}
    </span>
  );
}
