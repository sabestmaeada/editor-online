"use client";

import { useEffect, useMemo } from "react";

type Props = {
  uid: string;
  name: string;
  color: string;
};

const COLOR_CHANGE_TYPE = "book-editor:color-change";

export function EditorFrame({ uid, name, color }: Props) {
  const src = useMemo(() => {
    const params = new URLSearchParams({ uid, name, color });
    return `/book-editor/editor.html#${params.toString()}`;
  }, [uid, name, color]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Same-origin guard
      if (e.origin !== window.location.origin) return;

      const data = e.data as
        | { type?: string; uid?: string; color?: string }
        | null;
      if (!data || data.type !== COLOR_CHANGE_TYPE) return;
      if (typeof data.color !== "string") return;

      // Sanity: only sync color for the same uid that this page was rendered for
      if (data.uid && data.uid !== uid) return;

      fetch("/api/users/me/color", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: data.color }),
      }).catch(() => {
        // Silent fail — color is still saved in editor's localStorage
      });
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [uid]);

  return (
    <iframe
      src={src}
      title="Book Editor"
      className="block h-screen w-screen border-0"
      allow="clipboard-read; clipboard-write"
    />
  );
}
