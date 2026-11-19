# Setting up WhatsApp (Meta Cloud API)

Automate Ideas can send invoices, payment reminders and receipts on WhatsApp in two ways:

| | Option A: the Automate Ideas number | Option B: each company's own number |
|---|---|---|
| Who sends | One WhatsApp Business number you own sends for every company that turns it on. The message names the company. | Each company connects its own WhatsApp Business number from **Billing → Settings → Email and reminders**. |
| Who pays Meta | You (Automate Ideas). A monthly cap per company protects you: `WHATSAPP_PLATFORM_MONTHLY_LIMIT` (default 1000). | Each company, on its own Meta account. |
| Setup effort | About an hour, once. | Your Meta app must pass **App Review** first (days to weeks). |

Without either, the **WhatsApp** button still works: it opens WhatsApp on the user's phone or computer with a ready message and a link.

No vendor is needed for either option. Everything below is done on Meta's own sites.

---

## Part 1: one Meta app (needed for both options)

1. **Meta Business account.** Go to [business.facebook.com](https://business.facebook.com) and create a business portfolio for Automate Ideas if you don't have one. Under **Settings → Security Center**, start **Business verification** (GST certificate or company documents). You can continue while it's reviewed.
2. **Create the app.** On [developers.facebook.com](https://developers.facebook.com), choose **My Apps → Create app**, pick the **Business** type, and attach it to your business portfolio. Add the **WhatsApp** product.
3. **App ID and secret.** In **App settings → Basic**, copy them into the server's `.env`:
   ```
   META_APP_ID=...
   META_APP_SECRET=...
   ```
4. **Webhook (delivery ticks).** This lets the app show *delivered* and *read* on each message.
   1. Put any long random text in `.env`: `WHATSAPP_VERIFY_TOKEN=...`.
   2. In the app go to **WhatsApp → Configuration → Webhook → Edit**.
   3. Set the callback URL to `https://<your domain>/api/webhooks/whatsapp` and the verify token to the same text.
   4. Under **Webhook fields**, subscribe to **messages**.

   The URL must be public HTTPS. For local testing, use a tunnel such as `cloudflared` or `ngrok`.

## Part 2: option A, the Automate Ideas number

1. **Add the number.** In the app open **WhatsApp → API Setup → Add phone number**.
   1. Use a number that is **not** currently on the WhatsApp or WhatsApp Business app.
   2. Set the display name, for example "Automate Ideas". Meta reviews it.
   3. Verify the number by SMS or call.
2. **Copy the IDs** from **API Setup** into `.env`:
   ```
   WHATSAPP_PHONE_NUMBER_ID=...
   WHATSAPP_WABA_ID=...          # "WhatsApp Business Account ID"
   ```
3. **Permanent access token.** The token shown on API Setup expires in 24 hours, so make a lasting one:
   1. In [business.facebook.com](https://business.facebook.com) go to **Settings → Users → System users → Add**. Choose the Admin role.
   2. **Assign assets.** Give it your app, and your WhatsApp account with full control.
   3. **Generate token.** Choose your app, set expiry to **Never**, and tick `whatsapp_business_messaging` and `whatsapp_business_management`.
   4. Put the token in `.env`: `WHATSAPP_ACCESS_TOKEN=...`
4. **Payment method.** In **WhatsApp Manager → Overview**, add a card. Meta charges per message delivered; invoices and reminders are the cheaper "utility" kind. See Meta's current India rate card.
5. **Public address.** Make sure `BETTER_AUTH_URL` in `.env` is your public `https://` address. The "View invoice" buttons in WhatsApp link there.
6. **Create the message templates:**
   ```
   pnpm whatsapp:templates
   ```
   This creates three templates: documents, payment reminders and receipts. Each shows `APPROVED` or `PENDING`. Meta usually approves them within minutes to a day. Run the command again to check.
7. **Restart the app.** Each company then turns on **Use the Automate Ideas WhatsApp number** in Billing → Settings → Email and reminders.

## Part 3: option B, each company's own number

This uses Meta's **Embedded Signup**: a "Connect your WhatsApp number" button opens Meta's popup, the company signs in with Facebook and picks or adds a number, and the app does the rest. That includes subscribing to delivery updates, registering the number and creating the templates in the company's own account.

1. **Get approved by Meta.** In the app dashboard, request **Advanced access** (App Review) for `whatsapp_business_management` and `whatsapp_business_messaging`. Business verification (Part 1) must be done first. Until approval, only people with a role on your app (admins, developers, testers) can connect, which is fine for trying it out.
2. **Facebook Login for Business.**
   1. Add the **Facebook Login for Business** product to the app.
   2. Under **Configurations → Create configuration**, choose the **WhatsApp Embedded Signup** variation.
   3. Copy the **Configuration ID** into `.env`: `WHATSAPP_EMBEDDED_CONFIG_ID=...`
3. **Allowed domains.** In Facebook Login for Business settings, add your app's domain to **Allowed domains for the JavaScript SDK**. In **App settings → Basic**, add it to **App domains**.
4. **Encryption key** for the companies' WhatsApp tokens:
   ```
   openssl rand -base64 32
   ```
   Put the result in `.env` as `APP_ENCRYPTION_KEY=...`. Keep it safe: if it changes, companies must connect their numbers again.
5. **Restart the app.** **Connect your WhatsApp number** now appears in each company's settings. Each company adds its own payment method in its WhatsApp Manager.

> Meta is retiring Embedded Signup v2 and v3 on 15 October 2026. Automate Ideas uses the current flow (v4).

---

## `.env` summary

| Variable | For | What |
|---|---|---|
| `META_APP_ID`, `META_APP_SECRET` | Webhook, option B | From App settings → Basic |
| `WHATSAPP_VERIFY_TOKEN` | Webhook | Any long random text, also entered in Meta's webhook settings |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_ACCESS_TOKEN` | Option A | The shared number and its permanent token |
| `WHATSAPP_PLATFORM_MONTHLY_LIMIT` | Option A | Messages per company per month from the shared number (default 1000) |
| `WHATSAPP_EMBEDDED_CONFIG_ID` | Option B | Facebook Login for Business configuration ID |
| `APP_ENCRYPTION_KEY` | Option B | `openssl rand -base64 32` |
| `WHATSAPP_GRAPH_VERSION` | Optional | Graph API version (default `v23.0`) |
| `WHATSAPP_DELIVERY=log` | Testing | Record messages without sending them |

## Troubleshooting

- **"WhatsApp didn't accept the message".** The message shows Meta's reason. Common ones:
  - The template isn't approved yet.
  - The number isn't on WhatsApp.
  - The payment method is missing.
  - Error 131026: the customer can't receive the message.
- **No delivered or read ticks.** Check the webhook: the callback URL must be public, the verify token must match, and **messages** must be subscribed. Each status update is checked with your app secret.
- **A company's connection says "Needs attention".** Its number couldn't be registered. Disconnect, then connect again. If the number was used on the WhatsApp app recently, it must be removed from there first.
