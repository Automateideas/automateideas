import { appUrl } from "@/lib/email";

import { graph } from "./graph";
import { TEMPLATE_KINDS, TEMPLATE_NAMES, templateDefinition } from "./templates";

// Managing a WhatsApp Business account's message templates. No database, so
// scripts/whatsapp-templates.ts can use it too.

/** Creates any missing Automate Ideas templates in a WhatsApp Business account; returns each one's status. */
export async function ensureTemplates(wabaId: string, token: string): Promise<Record<string, string>> {
  const existing = await graph<{ data?: { name: string; status: string; language: string }[] }>(`${wabaId}/message_templates`, { token, query: { fields: "name,status,language", limit: "200" } });
  const status: Record<string, string> = {};
  for (const kind of TEMPLATE_KINDS) {
    const name = TEMPLATE_NAMES[kind];
    const found = existing.data?.find((t) => t.name === name && t.language === "en");
    if (found) {
      status[name] = found.status;
      continue;
    }
    try {
      const created = await graph<{ status?: string }>(`${wabaId}/message_templates`, { token, body: templateDefinition(kind, appUrl("/")) });
      status[name] = created.status ?? "PENDING";
    } catch (e) {
      status[name] = `ERROR: ${(e as Error).message}`.slice(0, 200);
    }
  }
  return status;
}
