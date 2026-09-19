import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/client";

const credentialsSchema = z.object({
  apiKey: z.string().min(16),
  orgId: z.string().optional(),
  projectId: z.string().optional(),
  connectedAccountId: z.string().regex(/^ca_[\w-]+$/),
});
export type ComposioCredentials = z.infer<typeof credentialsSchema> & { operationId?: string };
export type GraphCredentials = string | ComposioCredentials;
export const parseComposioCredentials = (value: string): ComposioCredentials =>
  credentialsSchema.parse(JSON.parse(value));

export class ComposioDeliveryUnconfirmedError extends Error {
  constructor() {
    super("Delivery is unconfirmed. Check the Instagram inbox before attempting another send.");
    this.name = "ComposioDeliveryUnconfirmedError";
  }
}

export function bearerHeaders(credentials: GraphCredentials): Record<string, string> {
  return typeof credentials === "string" ? { Authorization: `Bearer ${credentials}` } : {};
}
export function setAccessToken(url: URL, credentials: GraphCredentials) {
  if (typeof credentials === "string") url.searchParams.set("access_token", credentials);
}

/** Same Graph request and response as direct Meta, with authentication held by Composio. */
export async function graphFetch(credentials: GraphCredentials, input: string, init: RequestInit = {}): Promise<Response> {
  if (typeof credentials === "string") return fetch(input, init);
  const endpoint = new URL(input);
  if (endpoint.origin !== "https://graph.instagram.com" || endpoint.username || endpoint.password)
    throw new Error("Composio Instagram requests must use graph.instagram.com");
  endpoint.searchParams.delete("access_token");
  const method = init.method ?? "GET";
  if (method !== "GET" && method !== "POST") throw new Error("Unsupported Instagram operation");
  const body = init.body ? JSON.parse(String(init.body)) : undefined;
  const writes = method === "POST";
  // A comment can receive one private reply. The durable claim survives queue
  // eviction, worker restarts, overlapping campaigns, and ambiguous responses.
  const operation = (endpoint.pathname.endsWith("/replies") ? "public-reply" : body?.recipient?.comment_id) ?? credentials.operationId ?? randomUUID();
  const receiptId = createHash("sha256").update(JSON.stringify([
    credentials.connectedAccountId, endpoint.pathname, operation,
    body?.recipient?.comment_id || endpoint.pathname.endsWith("/replies") ? null : body,
  ])).digest("hex");
  if (writes) {
    try { await prisma.composioDelivery.create({ data: { id: receiptId } }); }
    catch (error) {
      if (!(typeof error === "object" && error && "code" in error && error.code === "P2002")) throw error;
      const receipt = await prisma.composioDelivery.findUnique({ where: { id: receiptId } });
      if (receipt?.response) return Response.json(receipt.response);
      throw new ComposioDeliveryUnconfirmedError();
    }
  }
  let response: Response;
  let result: { status?: number; data?: Record<string, unknown> };
  try {
    response = await fetch("https://backend.composio.dev/api/v3.1/tools/execute/proxy", {
      method: "POST", headers: { ...(credentials.orgId && credentials.projectId ? { "x-user-api-key": credentials.apiKey, "x-org-id": credentials.orgId, "x-project-id": credentials.projectId } : { "x-api-key": credentials.apiKey }), "Content-Type": "application/json" },
      body: JSON.stringify({ connected_account_id: credentials.connectedAccountId, endpoint: endpoint.toString(), method, ...(body ? { body } : {}) }),
      cache: "no-store", signal: AbortSignal.timeout(30_000), redirect: "error",
    });
    result = await response.json();
  } catch {
    if (writes) throw new ComposioDeliveryUnconfirmedError();
    throw new Error("Composio could not reach Instagram. Try again shortly.");
  }
  if (!response.ok) {
    if (writes && response.status >= 500) throw new ComposioDeliveryUnconfirmedError();
    if (writes) await prisma.composioDelivery.delete({ where: { id: receiptId } });
    // Do not persist Composio response bodies: they can contain credential data.
    return Response.json({ error: { code: response.status === 401 ? 190 : response.status === 429 ? 4 : response.status, message: `Composio request failed (HTTP ${response.status})` } }, { status: response.status });
  }
  if (!result.data || typeof result.status !== "number" || result.status < 200 || result.status > 599) {
    if (writes) throw new ComposioDeliveryUnconfirmedError();
    throw new Error("Composio returned an invalid Instagram response");
  }
  if (writes) {
    if (result.status >= 500) throw new ComposioDeliveryUnconfirmedError();
    if (result.status >= 400 || result.data.error) await prisma.composioDelivery.delete({ where: { id: receiptId } });
    else {
      if (!result.data.message_id && !result.data.id) throw new ComposioDeliveryUnconfirmedError();
      try {
        await prisma.composioDelivery.update({ where: { id: receiptId }, data: { response: result.data as { message_id: string } } });
      } catch { throw new ComposioDeliveryUnconfirmedError(); }
    }
  }
  return Response.json(result.data, { status: result.status });
}
