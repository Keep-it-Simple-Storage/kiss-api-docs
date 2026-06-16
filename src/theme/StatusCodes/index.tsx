import React, {useState, useEffect, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import OriginalStatusCodes from '@theme-original/StatusCodes';

// The body MDX renders <StatusCodes {...require("./….StatusCodes.json")}/>, so
// this is the only place with the per-endpoint response data. We don't want the
// responses in the main body — they belong in the right column under the cURL.
// So portal the rendered output into the slot ApiExplorer renders on the right.
// React portals preserve context (the status tabs keep working); only the DOM
// moves. ApiExplorer is wrapped in BrowserOnly, so its slot mounts a tick late —
// retry until it exists, and fall back to inline if it never appears.
export default function StatusCodes(props: any): ReactNode {
  const [mounted, setMounted] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    setMounted(true);
    let raf = 0;
    let tries = 0;
    const find = () => {
      const el = document.getElementById('kiss-response-slot');
      if (el) {
        setTarget(el);
      } else if (tries++ < 60) {
        raf = requestAnimationFrame(find);
      } else {
        setGaveUp(true);
      }
    };
    find();
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  if (!mounted) return null;
  const content = <OriginalStatusCodes {...props} />;
  if (target) return createPortal(content, target);
  if (gaveUp) return content; // fallback: render inline if no slot was found
  return null; // waiting for the right-column slot; don't flash in the body
}
