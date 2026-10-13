import { describeWorkflow, runWorkflowCases } from "../src/index.js";
import { cases } from "./team-workflow.cases.js";

describeWorkflow("team-context", () => runWorkflowCases(cases));
