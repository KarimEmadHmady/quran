import { descendantIds, hiddenMap, titleKey, type TopicRow } from './topic-admin';

const t = (id: number, parentId: number | null, isBanned = false): TopicRow => ({
  id,
  parentId,
  title: `t${id}`,
  isBanned,
});

describe('hiddenMap', () => {
  it('hides banned topics and their whole subtree, keeps the rest visible', () => {
    const rows = [t(1, null), t(2, 1), t(3, null, true), t(4, 3), t(5, 4)];
    const m = hiddenMap(rows);
    expect([...m.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [1, false],
      [2, false],
      [3, true],
      [4, true],
      [5, true],
    ]);
  });

  it('hides rows whose parent is missing and rows in a parent cycle', () => {
    const m = hiddenMap([t(1, 99), t(2, 3), t(3, 2), t(4, null)]);
    expect(m.get(1)).toBe(true);
    expect(m.get(2)).toBe(true);
    expect(m.get(3)).toBe(true);
    expect(m.get(4)).toBe(false);
  });

  it('does not depend on row order', () => {
    const a = hiddenMap([t(5, 4), t(4, 3), t(3, null, true)]);
    const b = hiddenMap([t(3, null, true), t(4, 3), t(5, 4)]);
    expect(a).toEqual(b);
  });
});

describe('descendantIds', () => {
  it('collects every level below a topic', () => {
    const rows = [t(1, null), t(2, 1), t(3, 2), t(4, 2), t(5, null)];
    expect([...descendantIds(rows, 1)].sort()).toEqual([2, 3, 4]);
    expect(descendantIds(rows, 5).size).toBe(0);
  });

  it('is cycle-safe', () => {
    expect([...descendantIds([t(1, 2), t(2, 1)], 1)]).toEqual([2]);
  });
});

describe('titleKey', () => {
  it('collapses Arabic spelling variants and spaces', () => {
    expect(titleKey(' الصلاة  ')).toBe(titleKey('الصلاه'));
    expect(titleKey('أحكام الزكاة')).toBe(titleKey('احكام  الزكاه'));
    expect(titleKey('الدُّعَاء')).toBe(titleKey('الدعاء'));
  });

  it('keeps Latin / digit parts distinct and case-insensitive', () => {
    expect(titleKey('Test A')).toBe(titleKey('test a'));
    expect(titleKey('Test A')).not.toBe(titleKey('Test B'));
    expect(titleKey('باب 1')).not.toBe(titleKey('باب 2'));
  });

  it('is empty for punctuation-only input', () => {
    expect(titleKey(' ... ')).toBe('...');
    expect(titleKey('ـــ')).toBe('');
  });
});
