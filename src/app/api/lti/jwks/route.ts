import { publicJwks } from "@/lib/lti/server";

// The tool's public keys (P8-08). LMSs check deep-linking responses and our AGS token
// requests against these.

export async function GET() {
  return Response.json(await publicJwks(), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
