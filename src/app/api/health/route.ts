import { jsonOk } from "@/lib/http";

export async function GET() {
  return jsonOk({
    ok: true,
    service: "x-growth-autopilot",
    timestamp: new Date().toISOString()
  });
}
