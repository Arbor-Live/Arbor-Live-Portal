import { resolveStoredR2AssetUrl } from "../inventoryR2";

type LexicalJsonNode = {
  type?: string;
  src?: string;
  altText?: string;
  children?: LexicalJsonNode[];
};

/** Serialized empty Lexical document — the baseline body for a new post. */
export const EMPTY_LEXICAL_STATE = JSON.stringify({
  root: {
    children: [
      {
        children: [],
        direction: null,
        format: "",
        indent: 0,
        type: "paragraph",
        version: 1,
      },
    ],
    direction: null,
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
});

export function normalizeFeaturedStats(
  stats: Array<{ label?: string; value?: string }> | undefined,
) {
  return (stats ?? [])
    .map((stat) => ({
      label: stat.label?.trim() ?? "",
      value: stat.value?.trim() ?? "",
    }))
    .filter((stat) => stat.label.length > 0 && stat.value.length > 0);
}

function walkLexicalJsonTree(value: unknown, visit: (node: LexicalJsonNode) => void) {
  if (!value || typeof value !== "object") return;
  const record = value as LexicalJsonNode;
  if (typeof record.type === "string") {
    visit(record);
  }
  for (const child of record.children ?? []) {
    walkLexicalJsonTree(child, visit);
  }
}

export async function resolveLexicalContentJson(contentJson: string) {
  try {
    const state = JSON.parse(contentJson) as { root?: LexicalJsonNode };
    if (!state.root) return contentJson;

    const pending: Promise<void>[] = [];
    walkLexicalJsonTree(state.root, (node) => {
      if (node.type !== "image" || typeof node.src !== "string") return;
      pending.push(
        resolveStoredR2AssetUrl(node.src).then((resolved) => {
          if (resolved) node.src = resolved;
        }),
      );
    });
    await Promise.all(pending);
    return JSON.stringify(state);
  } catch {
    return contentJson;
  }
}
