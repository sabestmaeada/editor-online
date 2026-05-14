import { requireUserProfile } from "@/lib/firebase/require-profile";
import { EditorFrame } from "./editor-frame";

export const dynamic = "force-dynamic";

export default async function EditorPage() {
  const profile = await requireUserProfile("/editor");

  return (
    <EditorFrame
      uid={profile.uid}
      name={profile.displayName || profile.email}
      color={profile.trackColor}
    />
  );
}
