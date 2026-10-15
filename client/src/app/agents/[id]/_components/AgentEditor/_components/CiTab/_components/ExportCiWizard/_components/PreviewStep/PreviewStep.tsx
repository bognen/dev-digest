/* PreviewStep — design step 2: file tree on the left, file pane on the right.
   Only the workflow is editable; the runner shows size + sha only. */
"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Toggle } from "@devdigest/ui";
import type { CiPreviewFile } from "@devdigest/shared";
import type { ExportWizardApi } from "../../useExportWizard";
import { agentDir, formatBytes } from "../../helpers";
import { ErrorNotice } from "../ErrorNotice";
import { s } from "../../styles";

function FileTreeRow({ file, active, onClick }: { file: CiPreviewFile; active: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={s.treeRow(active, hover)}
    >
      <Icon.FileText size={13} style={s.treeIcon(active)} />
      <span className="mono" style={s.treePath(active)}>
        {file.path}
      </span>
    </button>
  );
}

export function PreviewStep({ w }: { w: ExportWizardApi }) {
  const t = useTranslations("ci.exportWizard");
  const { state, preview: req, lint } = w;
  const { preview } = state;

  if (req.error) {
    return <ErrorNotice error={req.error} operation="preview" onRetry={w.actions.retryPreview} />;
  }
  if (!preview || req.pending) {
    return <div style={s.previewPlaceholder}>{t("generating")}</div>;
  }

  const file = preview.files.find((f) => f.path === state.selectedPath) ?? preview.files[0];
  const isWorkflow = file?.path === preview.workflow_path;
  const editable = !!file?.editable && isWorkflow && state.workflowYaml != null;
  const text = isWorkflow ? (state.workflowYaml ?? "") : (file?.contents ?? "");

  return (
    <div>
      <div style={s.previewGrid}>
        <div style={s.tree}>
          <div style={s.treeHeader}>{t("filesToCreate")}</div>
          {preview.files.map((f) => (
            <FileTreeRow key={f.path} file={f} active={f.path === file?.path} onClick={() => w.actions.selectFile(f.path)} />
          ))}
        </div>
        <div style={s.paneCol}>
          <div style={s.paneHeader}>
            <span className="mono" style={s.panePath}>
              {file?.path}
            </span>
            {editable ? (
              <Badge color="var(--text-muted)" icon="Edit">
                {t("editable")}
              </Badge>
            ) : (
              <Badge color="var(--text-muted)">{t("readOnly")}</Badge>
            )}
            {editable && (
              <Button size="sm" kind="tertiary" icon="RefreshCw" onClick={w.actions.regenerate}>
                {t("regenerate")}
              </Button>
            )}
          </div>
          {editable ? (
            <textarea
              className="mono"
              aria-label={file?.path}
              spellCheck={false}
              value={text}
              onChange={(e) => w.actions.editWorkflow(e.target.value)}
              style={s.code}
            />
          ) : file?.contents == null ? (
            <pre className="mono" style={s.code}>
              {t("runnerBundle", { size: formatBytes(file?.size_bytes ?? 0) })}
              {"\n"}sha256: {file?.sha256}
            </pre>
          ) : (
            <pre className="mono" style={s.code}>
              {file.contents}
            </pre>
          )}
          {editable && lint?.error && (
            <div role="alert" style={s.lintError}>
              {lint.error.line != null ? t("yamlError", { line: lint.error.line }) : t("yamlErrorGeneric")}
            </div>
          )}
          {editable &&
            lint?.warnings.map((k) => (
              <div key={k} role="status" style={s.lintWarn}>
                {k === "secrets" ? t("yamlWarningSecrets") : t("yamlWarningPermissions")}
              </div>
            ))}
        </div>
      </div>
      <div style={s.previewNote}>
        <label style={s.row10}>
          <Toggle on={state.memory} onChange={(memory) => w.actions.changeConfig({ memory })} />
          <span style={s.strong}>{t("memoryTitle")}</span>
        </label>
        <span>{t("memoryDesc", { slug: preview.slug })}</span>
      </div>
      <div style={{ ...s.muted12, marginTop: 8 }}>
        {t("slugNote", { dir: agentDir(preview.slug), workflow: preview.workflow_path })}
      </div>
    </div>
  );
}
