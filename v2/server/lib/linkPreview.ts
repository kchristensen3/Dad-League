/**
 * Fetches Open Graph metadata for a pasted link. Because the server fetches a
 * URL a user chose, it refuses private/loopback addresses (SSRF), caps time
 * and size, and follows redirects manually so each hop is re-checked.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { LinkPreview } from "../../shared/schemas.js";

const MAX_BYTES = 512_000;
const TIMEOUT_MS = 5000;

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

async function assertPublic(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported protocol");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) throw new Error("blocked host");
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

export function parseMeta(html: string, url: string): LinkPreview {
  const meta = (key: string) => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
      "i",
    );
    const m = html.match(re);
    return m ? decode(m[1] ?? m[2] ?? "") : "";
  };
  const title = meta("og:title") || meta("twitter:title") || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "");
  const description = meta("og:description") || meta("description") || meta("twitter:description");
  let image: string | null = meta("og:image") || meta("twitter:image") || null;
  if (image) {
    try {
      image = new URL(image, url).toString();
      if (!image.startsWith("https://")) image = null;
    } catch {
      image = null;
    }
  }
  return { url, title: title || new URL(url).hostname, description: description.slice(0, 300), image };
}

export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview | null> {
  try {
    let url = new URL(rawUrl);
    for (let hop = 0; hop < 4; hop++) {
      await assertPublic(url);
      const res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": "DadLeagueBot/2.0 (link preview)", accept: "text/html" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location")!, url);
        continue;
      }
      if (!res.ok || !res.body || !(res.headers.get("content-type") ?? "").includes("html")) return null;
      const reader = res.body.getReader();
      let html = "";
      const decoder = new TextDecoder();
      while (html.length < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        if (html.includes("</head>")) break;
      }
      await reader.cancel().catch(() => {});
      return parseMeta(html, url.toString());
    }
    return null;
  } catch {
    return null;
  }
}
