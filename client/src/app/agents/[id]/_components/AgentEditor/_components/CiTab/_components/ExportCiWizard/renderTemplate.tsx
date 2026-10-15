/* renderTemplate — fills `{name}` placeholders of a raw message with React nodes. The ci.json
   copy uses plain placeholders (not rich-text tags), so inline mono/bold/link nodes are
   substituted here instead of via `t.rich`. */
import React from "react";

export function renderTemplate(raw: string, values: Record<string, React.ReactNode>): React.ReactNode[] {
  return raw.split(/(\{\w+\})/g).map((part, i) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    return name ? <React.Fragment key={i}>{values[name]}</React.Fragment> : part;
  });
}
