import { buildTopicTree, visibleTopics, type PublicTopic } from './topic-tree';

const t = (id: number, parentId: number | null = null): PublicTopic => ({
  id,
  parentId,
  title: `t${id}`,
  description: null,
});

describe('visibleTopics', () => {
  it('keeps roots and children whose ancestors are all present, in input order', () => {
    const rows = [t(1), t(2, 1), t(3, 2), t(4)];
    expect(visibleTopics(rows).map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });

  it('hides the whole subtree under a banned (absent) parent', () => {
    // 50 is banned, so it is not in the input; 51 and its child 52 must disappear too.
    const rows = [t(1), t(51, 50), t(52, 51), t(2, 1)];
    expect(visibleTopics(rows).map((r) => r.id)).toEqual([1, 2]);
  });

  it('hides rows in a parent cycle without looping forever', () => {
    const rows = [t(1, 2), t(2, 1), t(3, 3), t(4)];
    expect(visibleTopics(rows).map((r) => r.id)).toEqual([4]);
  });

  it('reuses earlier results (child listed before parent)', () => {
    const rows = [t(3, 2), t(2, 1), t(1)];
    expect(visibleTopics(rows).map((r) => r.id)).toEqual([3, 2, 1]);
    const hidden = [t(3, 2), t(2, 99)];
    expect(visibleTopics(hidden)).toEqual([]);
  });

  it('handles an empty list', () => {
    expect(visibleTopics([])).toEqual([]);
  });
});

describe('buildTopicTree', () => {
  it('nests children under parents and keeps order', () => {
    const tree = buildTopicTree([t(1), t(2, 1), t(3), t(4, 1), t(5, 2)]);
    expect(tree.map((n) => n.id)).toEqual([1, 3]);
    expect(tree[0].children.map((n) => n.id)).toEqual([2, 4]);
    expect(tree[0].children[0].children.map((n) => n.id)).toEqual([5]);
    expect(tree[1].children).toEqual([]);
  });

  it('keeps public fields on every node', () => {
    const [node] = buildTopicTree([{ id: 7, parentId: null, title: 'x', description: 'd' }]);
    expect(node).toEqual({ id: 7, parentId: null, title: 'x', description: 'd', children: [] });
  });
});
