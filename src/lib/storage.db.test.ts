import { describe, expect, it } from "vitest";

import { deleteFile, getFileBytes, putFile, signedFileUrl, storageEnabled } from "./storage";

// File storage (S3, R2 or local SeaweedFS) with the settings in .env:
// upload, read back, open a signed link, delete. Skipped when storage isn't configured.

describe.skipIf(!storageEnabled())("file storage", () => {
  it("stores, serves and deletes a file", async () => {
    const key = `healthchecks/storage-test-${Date.now()}.txt`;
    await putFile(key, new TextEncoder().encode("storage check"), "text/plain");
    try {
      const file = await getFileBytes(key);
      expect(new TextDecoder().decode(file.bytes)).toBe("storage check");
      expect(file.contentType).toBe("text/plain");
      const res = await fetch(await signedFileUrl(key, 60));
      expect(res.ok).toBe(true);
      expect(await res.text()).toBe("storage check");
    } finally {
      await deleteFile(key);
    }
    await expect(getFileBytes(key)).rejects.toBeTruthy();
  });
});
