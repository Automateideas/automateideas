// Creates the Automate Ideas message templates in the SHARED WhatsApp
// Business account (option A) and prints their approval status.
//
//   pnpm whatsapp:templates
//
// Needs WHATSAPP_WABA_ID and WHATSAPP_ACCESS_TOKEN in .env, and
// BETTER_AUTH_URL set to the public address (the "View" buttons link there).
// Safe to run again: existing templates are only checked. Companies that
// connect their own number get the templates automatically.

import { ensureTemplates } from "../src/lib/business-billing/whatsapp/manage";

async function main() {
  const waba = process.env.WHATSAPP_WABA_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!waba || !token) {
    console.error("Set WHATSAPP_WABA_ID and WHATSAPP_ACCESS_TOKEN in .env first (see docs/whatsapp-setup.md).");
    process.exit(1);
  }
  const status = await ensureTemplates(waba, token);
  for (const [name, s] of Object.entries(status)) console.log(`${name.padEnd(28)} ${s}`);
  console.log("\nAPPROVED templates can be used now. PENDING ones usually approve within minutes to a day; run this again to check.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
