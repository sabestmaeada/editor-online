import { requireRole } from "@/lib/firebase/require-role";
import { Nav } from "@/components/nav";
import { CreditsForm } from "./credits-form";

export const dynamic = "force-dynamic";

export default async function CreditsToolPage() {
  // Gate: only roles that actually produce books need this tool. Other
  // roles get bounced to /dashboard by requireRole.
  const profile = await requireRole("/tools/credits", ["admin", "editor"]);

  return (
    <>
      <Nav profile={profile} />
      <CreditsForm />
    </>
  );
}
