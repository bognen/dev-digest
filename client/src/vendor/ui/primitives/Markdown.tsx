import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface MarkdownProps {
  children?: string | null;
  /**
   * Optional link policy. Called with each link's href: return a string to render
   * an anchor (opens in a new tab, noopener) or null to render the text as a plain span.
   * Omitted = links render as before.
   */
  transformHref?: (href: string) => string | null;
}

/** Markdown renderer (replaces prototype mdLite). Inline + GFM. */
export function Markdown({ children, transformHref }: MarkdownProps) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          code: ({ children }) => (
            <code
              className="mono"
              style={{
                fontSize: "0.92em",
                padding: "1px 6px",
                borderRadius: 4,
                background: "var(--bg-hover)",
                color: "var(--accent-text)",
              }}
            >
              {children}
            </code>
          ),
          a: ({ children, href }) => {
            if (!transformHref) {
              return (
                <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
                  {children}
                </a>
              );
            }
            const safe = href ? transformHref(href) : null;
            if (safe === null) return <span>{children}</span>;
            return (
              <a
                href={safe}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent-text)", textDecoration: "underline" }}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
