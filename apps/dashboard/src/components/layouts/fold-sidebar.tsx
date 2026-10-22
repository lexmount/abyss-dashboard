import * as React from "react";
import { useSidebar } from "@lexmount.com/abyss-ui";

/**
 * Folds the sidebar away while `target` is out of view, and opens it again
 * once the target is all back in view. Folding is the sidebar's own collapse,
 * so its toggle, shortcut and animation work as on any page; the page acts
 * only when the target crosses into or out of view, never while scrolling in
 * between. A sidebar collapsed by hand stays collapsed, and one opened by hand
 * while folded stays open until the target comes back and leaves again.
 */
export function FoldSidebarWhileAway({
  target,
}: {
  target: React.RefObject<HTMLElement | null>;
}) {
  const { open, setOpen, isMobile } = useSidebar();

  // Whether the sidebar is collapsed because the page folded it. Opening it,
  // by hand or by the page, ends that.
  const folded = React.useRef(false);
  React.useEffect(() => {
    if (open) {
      folded.current = false;
    }
  }, [open]);

  const onCross = React.useEffectEvent((entry: IntersectionObserverEntry) => {
    if (isMobile) {
      return;
    }
    if (!entry.isIntersecting) {
      if (open) {
        folded.current = true;
        setOpen(false);
      }
    } else if (entry.intersectionRatio === 1 && folded.current) {
      setOpen(true);
    }
  });

  React.useEffect(() => {
    const element = target.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      return;
    }
    // Gone at 0, all back at 1. In between nothing changes, so the width the
    // fold gives or takes back cannot flip it straight back.
    const observer = new IntersectionObserver(([entry]) => onCross(entry), {
      threshold: [0, 1],
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [target]);

  return null;
}
