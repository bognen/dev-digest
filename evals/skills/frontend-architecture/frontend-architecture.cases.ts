import type { SkillCase } from "../../src/index.js";
import { fixtureReader } from "../../src/artifacts/fixture.js";

// frontend-architecture is the L02 skill that decides WHERE client/ code lives (pages,
// _components, shared components, hooks, constants, helpers) and how it is layered. Quality
// cases run with no tools (skillTask measures SKILL.md in isolation), so every prompt carries
// everything the skill needs: a fixture file or a concrete placement question.
// `grounding` holds concrete facts the skill's answer sheet fixes verbatim (cheap patternMatch
// tier, must all appear); `practices` are graded by the judge with evidence quotes.

const fixture = fixtureReader(import.meta.url);

const NO_TOOLS =
  "Answer directly from what is given here — do not ask for tool access or for more files.";

export const cases: SkillCase[] = [
  {
    name: "places a single-route component in the route's private _components folder",
    kind: "quality",
    prompt: `${NO_TOOLS}

I'm adding a \`RunBadge\` React component to client/. Only the agent editor page (route \`/agents/[id]\`, file client/src/app/agents/[id]/page.tsx) uses it. It has a couple of style objects and one color constant. Where exactly should it live, which files should the folder contain, and how does page code import it?`,
    grounding: ["_components/RunBadge"],
    practices: [
      "places the component under the route's private folder client/src/app/agents/[id]/_components/RunBadge/ (not under src/components/ and not loose in the route folder)",
      "names an index.ts forwarder plus RunBadge.tsx in that folder, and puts the style objects in a styles.ts and the color constant in a constants.ts in the same folder",
      "says the import path goes through the folder (e.g. ./_components/RunBadge), relying on the index.ts forwarder rather than a wide re-export barrel",
    ],
    threshold: 0.6,
    maxTurns: 6,
  },
  {
    name: "review flags fetching, deep design-system imports, hard-coded colors and magic numbers",
    kind: "quality",
    prompt: `${NO_TOOLS}

Review this new component for frontend-architecture problems in our Next.js client and say where each piece should move:

\`\`\`tsx
${fixture("RunHistoryCard.tsx")}
\`\`\``,
    grounding: ["@devdigest/ui", "lib/hooks"],
    practices: [
      "flags that the component calls fetch itself and says data must come through a TanStack Query hook in src/lib/hooks/<domain>.ts that calls src/lib/api.ts (no hard-coded http://localhost:3001 base URL)",
      "flags both deep imports into the design system (@devdigest/ui/primitives/Button and the relative vendor/ui/primitives/Badge path) and says to import from the @devdigest/ui barrel",
      "flags the hard-coded hex colors in the inline style and says to use var(--…) tokens in a co-located styles.ts",
      // Calibrated (run 1): the answer is judged on whether it catches inline values at all — the
      // skill states both rules, but a review naturally picks the more prominent one.
      "flags at least one kind of inline literal: the magic number 25 / 'cancelled' (→ constants.ts) or the user-visible strings 'Recent runs' / 'Total spend' / 'Clear' (→ messages/en/*.json)",
    ],
    threshold: 0.6,
    maxTurns: 6,
  },
  {
    name: "promotes a component to src/components when a second route needs it",
    kind: "quality",
    prompt: `${NO_TOOLS}

\`SkillBadge\` lives in client/src/app/skills/[id]/_components/SkillBadge/ and is used by the skill editor page. Now the agents list page (client/src/app/agents/page.tsx) needs the same badge. A teammate proposes importing it from the agents page as \`import { SkillBadge } from "../skills/[id]/_components/SkillBadge"\`. Is that OK? What should we do instead?`,
    grounding: ["src/components/"],
    practices: [
      "rejects importing another route's _components from the agents page (one route never imports another route's private _components)",
      "recommends promoting SkillBadge to the shared location client/src/components/<kebab-group>/SkillBadge/ because a second route now needs it (the promotion ladder)",
      "keeps the import direction rule: shared code in src/components must not import from a route's _components, and both routes then import the promoted component (e.g. via the @/ alias)",
    ],
    threshold: 0.6,
    maxTurns: 6,
  },
  {
    name: "rejects a utils.ts grab-bag and names helpers by domain",
    kind: "quality",
    prompt: `${NO_TOOLS}

I want to create client/src/lib/utils.ts and put formatCost(), formatRelativeTime(), a cn() class joiner and a severityColor() map in it so every component can import them. Good idea?`,
    practices: [
      "rejects a utils.ts grab-bag file and says helper modules are named by domain (e.g. src/lib/format.ts) instead",
      "says a helper used by only one component belongs in that component folder's helpers.ts rather than in src/lib",
      // Calibrated (run 1): "no export * barrel" was never asked about — grade the split instead.
      "splits the four helpers by domain (e.g. formatting helpers vs severity color mapping / class joining) instead of keeping them in one shared module",
    ],
    threshold: 0.6,
    maxTurns: 6,
  },
];
