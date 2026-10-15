/* useExportWizard — wizard state (useReducer) + the preview / install / zip mutations.
   Regeneration and requests happen in event handlers, never in effects. */
"use client";

import { useMemo, useReducer } from "react";
import type { CiPostAs, CiPreview, CiTrigger } from "@devdigest/shared";
import { useCiInstall, useCiPreview, useCiSecretsStatus, useCiZip } from "@/lib/hooks";
import {
  DEFAULT_POST_AS,
  DEFAULT_TRIGGERS,
  STEP_CONFIGURE,
  STEP_INSTALL,
  STEP_PREVIEW,
  STEP_TARGET,
} from "./constants";
import { canContinueConfigure, classifyError, findWorkflow, lintWorkflowYaml, toPreviewInput } from "./helpers";

export interface ConfigPatch {
  triggers?: CiTrigger[];
  postAs?: CiPostAs;
  memory?: boolean;
}

export interface WizardState {
  step: number;
  repoId: string;
  triggers: CiTrigger[];
  postAs: CiPostAs;
  memory: boolean;
  preview: CiPreview | null;
  selectedPath: string | null;
  /** Current workflow text (generated or hand-edited). */
  workflowYaml: string | null;
  workflowEdited: boolean;
  /** Config change waiting for the "regenerate the workflow?" confirmation. */
  pending: ConfigPatch | null;
}

type Action =
  | { type: "step"; step: number }
  | { type: "repo"; repoId: string }
  | { type: "config"; patch: ConfigPatch }
  | { type: "previewLoaded"; preview: CiPreview }
  | { type: "select"; path: string }
  | { type: "edit"; text: string }
  | { type: "ask"; patch: ConfigPatch }
  | { type: "decline" };

export function initWizard(repoId: string): WizardState {
  return {
    step: STEP_TARGET,
    repoId,
    triggers: [...DEFAULT_TRIGGERS],
    postAs: DEFAULT_POST_AS,
    memory: false,
    preview: null,
    selectedPath: null,
    workflowYaml: null,
    workflowEdited: false,
    pending: null,
  };
}

export function wizardReducer(state: WizardState, a: Action): WizardState {
  switch (a.type) {
    case "step":
      return { ...state, step: a.step };
    case "repo":
      // A different repository invalidates the generated bundle (and any edit of it).
      return a.repoId === state.repoId
        ? state
        : { ...state, repoId: a.repoId, preview: null, workflowYaml: null, workflowEdited: false };
    case "config":
      return { ...state, ...a.patch, pending: null };
    case "previewLoaded": {
      const wf = findWorkflow(a.preview);
      const keep = a.preview.files.some((f) => f.path === state.selectedPath);
      return {
        ...state,
        preview: a.preview,
        workflowYaml: wf?.contents ?? null,
        workflowEdited: false,
        selectedPath: keep ? state.selectedPath : a.preview.workflow_path,
      };
    }
    case "select":
      return { ...state, selectedPath: a.path };
    case "edit":
      return { ...state, workflowYaml: a.text, workflowEdited: true };
    case "ask":
      return { ...state, pending: a.patch };
    case "decline":
      return { ...state, pending: null };
  }
}

export type ExportWizardApi = ReturnType<typeof useExportWizard>;

export function useExportWizard(agentId: string, initialRepoId: string) {
  const [state, dispatch] = useReducer(wizardReducer, initialRepoId, initWizard);
  const previewM = useCiPreview();
  const installM = useCiInstall();
  const zipM = useCiZip();
  const secrets = useCiSecretsStatus(
    state.step >= STEP_CONFIGURE ? agentId : null,
    state.step >= STEP_CONFIGURE ? state.repoId : null,
  );

  const lint = useMemo(
    () => (state.workflowYaml != null && state.workflowEdited ? lintWorkflowYaml(state.workflowYaml) : null),
    [state.workflowYaml, state.workflowEdited],
  );

  const inputFor = (patch: ConfigPatch = {}) => toPreviewInput({ ...state, ...patch });

  const fetchPreview = (patch: ConfigPatch = {}) =>
    previewM.mutate(
      { agentId, body: inputFor(patch) },
      { onSuccess: (preview) => dispatch({ type: "previewLoaded", preview }) },
    );

  /** Apply a config change, asking first when it would discard a hand edit (AC-55). */
  const changeConfig = (patch: ConfigPatch) => {
    if (state.workflowEdited) {
      dispatch({ type: "ask", patch });
      return;
    }
    dispatch({ type: "config", patch });
    if (state.preview) fetchPreview(patch);
  };

  const confirmRegenerate = () => {
    if (!state.pending) return;
    const patch = state.pending;
    dispatch({ type: "config", patch });
    fetchPreview(patch);
  };

  const next = () => {
    if (state.step === STEP_TARGET && !state.preview) fetchPreview();
    dispatch({ type: "step", step: Math.min(state.step + 1, STEP_INSTALL) });
  };
  const back = () => dispatch({ type: "step", step: Math.max(state.step - 1, STEP_TARGET) });

  const install = (branch?: string) => {
    installM.mutate({
      agentId,
      body: {
        ...inputFor(),
        workflow_yaml: state.workflowEdited ? state.workflowYaml : null,
        ...(branch ? { branch } : {}),
      },
    });
  };

  const downloadZip = () =>
    zipM.mutate({
      agentId,
      body: { ...inputFor(), workflow_yaml: state.workflowEdited ? state.workflowYaml : null },
      filename: state.preview ? `devdigest-ci-${state.preview.slug}.zip` : undefined,
    });

  return {
    state,
    lint,
    secrets: secrets.data,
    secretsFailed: secrets.isError,
    canContinue: {
      [STEP_TARGET]: !!state.repoId,
      [STEP_PREVIEW]: !!state.preview && !previewM.isPending,
      [STEP_CONFIGURE]: canContinueConfigure(state.triggers),
    } as Record<number, boolean>,
    preview: { pending: previewM.isPending, error: classifyError(previewM.error) },
    install: {
      pending: installM.isPending,
      result: installM.data,
      error: classifyError(installM.error),
      run: install,
    },
    zip: { pending: zipM.isPending, error: classifyError(zipM.error), run: downloadZip },
    actions: {
      next,
      back,
      changeConfig,
      confirmRegenerate,
      declineRegenerate: () => dispatch({ type: "decline" }),
      setRepo: (repoId: string) => dispatch({ type: "repo", repoId }),
      selectFile: (path: string) => dispatch({ type: "select", path }),
      editWorkflow: (text: string) => dispatch({ type: "edit", text }),
      regenerate: () => changeConfig({}),
      retryPreview: () => fetchPreview(),
    },
  };
}
