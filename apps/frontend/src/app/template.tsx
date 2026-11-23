/**
 * Root template: unlike layout.tsx it re-mounts on every navigation, so each page plays the
 * global enter animation (.page-enter in globals.css). Opacity only on this wrapper: a transform
 * here would turn it into the containing block for every `fixed` element inside a page.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
