/**
 * Dedicated layout for the /deck render target.
 *
 * Intent: bypass the root layout's `<PrivateBanner/>` and force the warm
 * "landing" palette. /deck is a dev-only PDF source - it must not show the
 * preview banner (it would end up printed on slide 1) and must not inherit
 * the Bloomberg-dark default, which is what happens if the root `body`
 * styles apply before the `.landing` scoped palette kicks in.
 *
 * We still re-import `globals.css` here because Next.js layout composition
 * merges metadata / html-attributes but not CSS - but the root layout
 * already loads globals.css via its own import, so the styles are
 * available in this tree too. We only need to wrap children in `.landing`
 * to opt into the warm light palette.
 */
export default function DeckLayout({ children }: { children: React.ReactNode }) {
  return <div className="landing">{children}</div>;
}
