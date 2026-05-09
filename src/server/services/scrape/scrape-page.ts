import { decodeHtml, firstMatch, stripHtml } from "@/lib/common";

export type ScrapedPage = {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  textSample: string;
};

export async function scrapeProductPage(url: string): Promise<ScrapedPage> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; MSAProductAnalyzer/0.1)",
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to scrape page: ${response.status}`);
  }

  const html = await response.text();
  const title = firstMatch(html, [
    /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i,
  ]);
  const description = firstMatch(html, [
    /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i,
    /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
  ]);
  const image = firstMatch(html, [/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i]);

  return {
    url,
    title,
    description,
    image,
    textSample: stripHtml(html).slice(0, 4000),
  };
}
