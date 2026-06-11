import axios from 'axios';

export interface JobDescription {
  title: string;
  company: string;
  description: string;
  location?: string;
  url: string;
}

export class JobCrawler {
  async crawlJobDescription(url: string): Promise<JobDescription> {
    const { data: html } = await axios.get<string>(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 15000,
    });

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 8000);

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/\s*[-|].*$/, '').trim() : 'Job Posting';

    return { title, company: '', description: text, url };
  }

  // no-op — kept for compatibility with callers that call close()
  async close() {}
}
