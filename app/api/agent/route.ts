import { getServerDeps } from "@/agent/server-deps";
import { handleAgentRequest } from "@/lib/api/handle-agent-request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleAgentRequest(request, getServerDeps);
}
