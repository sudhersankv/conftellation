import { describe, expect, it } from "vitest";
import { agendaLinks, extraPageCap } from "@/lib/agents/scout/adapters/generic";
import { isBlockedAddress, publicUrlProblem } from "@/lib/publicUrl";

describe("public URL guard", () => {
  it("rejects localhost, private, link-local, and non-http urls", () => {
    const blocked = [
      "http://127.0.0.1/secret",
      "http://localhost/admin",
      "http://10.1.2.3/x",
      "http://192.168.1.9/",
      "http://172.16.0.5/",
      "http://169.254.169.254/latest",
      "http://[::1]/",
      "http://[fd00::1]/",
      "http://[fe80::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://0.0.0.0/",
      "http://metadata.google.internal/",
      "http://printer.local/",
      "file:///etc/passwd",
      "ftp://example.com/feed",
      "http://2130706433/",
    ];
    for (const url of blocked) expect(publicUrlProblem(url), url).toBeTruthy();
    expect(publicUrlProblem("https://events.example.org/kccnna")).toBeNull();
    expect(publicUrlProblem("https://8.8.8.8/dns")).toBeNull();
  });

  it("treats mapped and unique-local addresses as blocked", () => {
    expect(isBlockedAddress("::ffff:7f00:1")).toBe(true);
    expect(isBlockedAddress("fd12::1")).toBe(true);
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
    expect(isBlockedAddress("2606:4700:4700::1111")).toBe(false);
  });
});

describe("generic crawl cap", () => {
  it("clamps extra pages to five", () => {
    const prev = process.env.SCOUT_EXTRA_PAGES;
    try {
      delete process.env.SCOUT_EXTRA_PAGES;
      expect(extraPageCap()).toBe(2);
      expect(extraPageCap("")).toBe(2);
      expect(extraPageCap("0")).toBe(0);
      expect(extraPageCap("20")).toBe(5);
      expect(extraPageCap("-3")).toBe(0);
      expect(extraPageCap("nope")).toBe(2);
    } finally {
      if (prev === undefined) delete process.env.SCOUT_EXTRA_PAGES;
      else process.env.SCOUT_EXTRA_PAGES = prev;
    }
  });

  it("returns at most the requested same-site agenda links", () => {
    const md = Array.from({ length: 8 }, (_, i) => `[a](https://cap.example/agenda/${i})`).join("\n");
    expect(agendaLinks(md, "https://cap.example/start", 5)).toHaveLength(5);
    expect(agendaLinks(md, "https://cap.example/start", 5).some((u) => u.includes("127.0.0.1"))).toBe(false);
  });
});
