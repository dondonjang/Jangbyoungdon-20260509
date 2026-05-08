import type { ParsedProductPage, ScrapedHtmlRecord } from "@/lib/scrape-types";

export type ScrapeRepository = {
  saveHtml(record: ScrapedHtmlRecord): Promise<ScrapedHtmlRecord>;
  saveParsed(record: ParsedProductPage): Promise<ParsedProductPage>;
  getHtml(id: string): Promise<ScrapedHtmlRecord | undefined>;
  getParsed(id: string): Promise<ParsedProductPage | undefined>;
};

const htmlRecords = new Map<string, ScrapedHtmlRecord>();
const parsedRecords = new Map<string, ParsedProductPage>();

export const inMemoryScrapeRepository: ScrapeRepository = {
  async saveHtml(record) {
    htmlRecords.set(record.id, record);
    return record;
  },
  async saveParsed(record) {
    parsedRecords.set(record.id, record);
    return record;
  },
  async getHtml(id) {
    return htmlRecords.get(id);
  },
  async getParsed(id) {
    return parsedRecords.get(id);
  },
};
