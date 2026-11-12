/** Public topic shape: never includes legacyUuid, titleRaw or isBanned. */
export interface PublicTopic {
  id: number;
  parentId: number | null;
  title: string;
  description: string | null;
}

export interface TopicNode extends PublicTopic {
  children: TopicNode[];
}

/**
 * Input rows are already `is_banned = 0`. A topic is visible only if every ancestor is also in
 * that set: children of a banned (or missing) parent are hidden together with it, and so are
 * rows caught in a parent cycle. Output keeps the input order.
 */
export function visibleTopics(rows: PublicTopic[]): PublicTopic[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const visible = new Map<number, boolean>();

  const isVisible = (start: PublicTopic): boolean => {
    const chain: number[] = [];
    let node: PublicTopic | undefined = start;
    let result = true;
    while (node) {
      const known = visible.get(node.id);
      if (known !== undefined) {
        result = known;
        break;
      }
      if (chain.includes(node.id)) {
        result = false; // cycle
        break;
      }
      chain.push(node.id);
      if (node.parentId === null) break;
      node = byId.get(node.parentId);
      if (!node) result = false; // parent is banned or missing
    }
    for (const id of chain) visible.set(id, result);
    return result;
  };

  return rows.filter(isVisible);
}

/** Builds a forest from an already-visible flat list. Children keep the input order. */
export function buildTopicTree(topics: PublicTopic[]): TopicNode[] {
  const nodes = new Map<number, TopicNode>(topics.map((t) => [t.id, { ...t, children: [] }]));
  const roots: TopicNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId === null ? undefined : nodes.get(node.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
