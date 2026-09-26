import { resolveRunMode } from "@/agent/server-deps";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "ForgeMind",
    mode: resolveRunMode(),
  });
}
