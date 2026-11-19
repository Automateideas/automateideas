import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { open, seal } from "@/lib/crypto/secret-box";

import { TEMPLATE_NAMES, templateDefinition, templateMessage } from "./templates";

describe("secret box", () => {
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.APP_ENCRYPTION_KEY;
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });
  afterEach(() => {
    process.env.APP_ENCRYPTION_KEY = previous;
  });

  it("round-trips, never repeats, and rejects tampering or the wrong key", () => {
    const a = seal("EAAG-secret-token");
    expect(a).not.toContain("secret");
    expect(open(a)).toBe("EAAG-secret-token");
    expect(seal("EAAG-secret-token")).not.toBe(a);
    const parts = a.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => open(parts.join("."))).toThrow();
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => open(a)).toThrow();
  });

  it("needs a 32-byte key", () => {
    process.env.APP_ENCRYPTION_KEY = "short";
    expect(() => seal("x")).toThrow(/32 bytes/);
  });
});

describe("templates", () => {
  it("message: body parameters in order, button carries the share token, no new lines or empties", () => {
    const m = templateMessage("reminder", ["Ravi\nKumar", "Shah Traders", "INV/1", "₹1,180.00", ""], "tok123");
    expect(m.name).toBe(TEMPLATE_NAMES.reminder);
    expect(m.language).toEqual({ code: "en" });
    expect(m.components[0].parameters.map((p) => p.text)).toEqual(["Ravi Kumar", "Shah Traders", "INV/1", "₹1,180.00", "-"]);
    expect(m.components[1]).toEqual({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "tok123" }] });
  });

  it("definition: utility category, body variables match the example, link button to /share/", () => {
    const d = templateDefinition("document", "https://app.example.com/");
    expect(d).toMatchObject({ name: "ai_document_v1", category: "UTILITY", language: "en" });
    const body = d.components[0] as { text: string; example: { body_text: string[][] } };
    expect(body.text.match(/\{\{\d\}\}/g)).toHaveLength(body.example.body_text[0].length);
    const button = (d.components[2] as { buttons: { url: string }[] }).buttons[0];
    expect(button.url).toBe("https://app.example.com/share/{{1}}");
  });
});
