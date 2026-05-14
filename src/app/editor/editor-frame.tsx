"use client";

type Props = {
  uid: string;
  name: string;
  color: string;
};

export function EditorFrame({ uid, name, color }: Props) {
  const params = new URLSearchParams({ uid, name, color });
  const src = `/book-editor/editor.html#${params.toString()}`;

  return (
    <iframe
      src={src}
      title="Book Editor"
      className="block h-screen w-screen border-0"
      allow="clipboard-read; clipboard-write"
    />
  );
}
