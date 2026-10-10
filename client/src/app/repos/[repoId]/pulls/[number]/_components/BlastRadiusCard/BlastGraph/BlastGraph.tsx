/* BlastGraph — dependency-free inline SVG of a PR's blast radius: changed symbols
   (left) -> callers as file:line (middle) -> endpoints/crons (right). Layout math
   lives in helpers.ts; callers link to the exact GitHub line when the PR's repo
   and head sha are known, else render as plain text. */
import { useTranslations } from "next-intl";
import { githubBlobUrl } from "@/lib/github-urls";
import {
  GRAPH_COLUMNS,
  GRAPH_MAX_CHARS,
  GRAPH_NODE_HEIGHT,
  GRAPH_WIDTH,
  MAX_GRAPH_CALLERS,
  GRAPH_NODE_RADIUS,
  GRAPH_TEXT_PAD,
} from "./constants";
import { buildGraphLayout, edgePath, isGraphEmpty, truncateLabel, type GraphSymbolInput } from "./helpers";
import { s } from "./styles";

interface BlastGraphProps {
  symbols: GraphSymbolInput[];
  repoFullName?: string | null;
  headSha?: string | null;
  /** Modal view: drop the inline max-height so the graph uses the available space. */
  expanded?: boolean;
}

const rectY = (y: number) => y - GRAPH_NODE_HEIGHT / 2;

export function BlastGraph({ symbols, repoFullName, headSha, expanded }: BlastGraphProps) {
  const t = useTranslations("blast");

  if (isGraphEmpty(symbols)) {
    return (
      <div style={s.empty} role="status">
        {t("graph.empty")}
      </div>
    );
  }

  const layout = buildGraphLayout(symbols, MAX_GRAPH_CALLERS);
  const { symbol, caller, target } = GRAPH_COLUMNS;

  return (
    <div style={expanded ? s.wrapExpanded : s.wrap}>
      <svg
        role="img"
        aria-label={t("graph.ariaLabel")}
        viewBox={`0 0 ${GRAPH_WIDTH} ${layout.height}`}
        style={s.svg}
      >
        <g>
          {layout.edges.map((e) => (
            <path key={e.id} d={edgePath(e)} style={s.edge} />
          ))}
        </g>

        <g>
          {layout.symbols.map((n) => (
            <g key={n.id}>
              <title>{n.title}</title>
              <rect x={symbol.x} y={rectY(n.y)} width={symbol.width} height={GRAPH_NODE_HEIGHT} rx={GRAPH_NODE_RADIUS} style={s.symbolNode} />
              <text x={symbol.x + GRAPH_TEXT_PAD} y={n.y} dominantBaseline="central" className="mono" style={s.symbolText}>
                {truncateLabel(n.label, GRAPH_MAX_CHARS.symbol)}
              </text>
            </g>
          ))}
        </g>

        <g>
          {layout.callers.map((n) => {
            const href =
              repoFullName && headSha
                ? githubBlobUrl(repoFullName, headSha, n.caller.file, n.caller.line, n.caller.line)
                : undefined;
            const text = (
              <text
                x={caller.x + GRAPH_TEXT_PAD}
                y={n.y}
                dominantBaseline="central"
                className="mono"
                style={href ? s.linkText : s.callerText}
              >
                {truncateLabel(n.label, GRAPH_MAX_CHARS.caller, "end")}
              </text>
            );
            return (
              <g key={n.id}>
                <title>{n.title}</title>
                <rect x={caller.x} y={rectY(n.y)} width={caller.width} height={GRAPH_NODE_HEIGHT} rx={GRAPH_NODE_RADIUS} style={s.node} />
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {text}
                  </a>
                ) : (
                  text
                )}
              </g>
            );
          })}
          {layout.more.map((n) => (
            <text key={n.id} x={caller.x + GRAPH_TEXT_PAD} y={n.y} dominantBaseline="central" style={s.moreText}>
              {t("graph.more", { count: n.hidden })}
            </text>
          ))}
        </g>

        <g>
          {layout.targets.map((n) => (
            <g key={n.id}>
              <title>{n.title}</title>
              <rect
                x={target.x}
                y={rectY(n.y)}
                width={target.width}
                height={GRAPH_NODE_HEIGHT}
                rx={GRAPH_NODE_RADIUS}
                style={n.kind === "endpoint" ? s.endpointNode : s.cronNode}
              />
              <text
                x={target.x + GRAPH_TEXT_PAD}
                y={n.y}
                dominantBaseline="central"
                className="mono"
                style={n.kind === "endpoint" ? s.endpointText : s.cronText}
              >
                {truncateLabel(n.label, GRAPH_MAX_CHARS.target)}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
