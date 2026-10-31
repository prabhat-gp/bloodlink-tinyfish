import { MODE, SESSION_STEP_CAP } from "@/lib/mode";
import { budgetStatus } from "@/lib/server/budget";

export const dynamic = "force-dynamic";

export async function GET() {
  if (MODE === "mock") return Response.json({ mode: MODE, used: 0, cap: SESSION_STEP_CAP });
  return Response.json({ mode: MODE, ...(await budgetStatus()) });
}
