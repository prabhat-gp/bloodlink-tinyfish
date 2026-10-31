import { BloodLinkApp } from "@/components/BloodLinkApp";
import { MODE, SESSION_STEP_CAP } from "@/lib/mode";
import { budgetStatus } from "@/lib/server/budget";
import { hasKey } from "@/lib/server/tinyfish";

export const dynamic = "force-dynamic";

export default async function Home() {
  const live = MODE === "live";
  const budget = live ? await budgetStatus() : null;
  return (
    <BloodLinkApp
      mock={!live}
      stepCap={budget?.cap ?? SESSION_STEP_CAP}
      initialSteps={budget?.used ?? 0}
      keyMissing={live && !hasKey()}
    />
  );
}
