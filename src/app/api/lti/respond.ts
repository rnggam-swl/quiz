// A plain page for LTI errors: it shows inside the LMS frame, where a JSON body helps nobody.

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function ltiErrorPage(message: string, status = 400): Response {
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quiz</title></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;padding:16px;text-align:center;color-scheme:light dark"><main><p style="font-size:2rem;margin:0" aria-hidden="true">🧩</p><p>${escape(message)}</p></main></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Login parameters arrive as a GET query or a form POST, depending on the LMS. */
export async function ltiParams(request: Request): Promise<URLSearchParams> {
  if (request.method !== "POST") return new URL(request.url).searchParams;
  const form = await request.formData().catch(() => null);
  const params = new URLSearchParams();
  form?.forEach((value, key) => {
    if (typeof value === "string") params.set(key, value);
  });
  return params;
}
