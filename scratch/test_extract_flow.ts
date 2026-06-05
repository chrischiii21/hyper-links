import * as cheerio from 'cheerio';
import { extractLinks, deduplicateAndEnhancePublishers, cleanPublisherText, type LinkData } from '../src/lib/linkUtils';

const mockHtml = `
<h2>Section X: Market</h2>
<p>Market context content...</p>
<table>
  <tr><td>ESG reporting pressure</td><td>Institutional...</td><td>High</td></tr>
  <tr><td>AI-driven...</td><td>Increasing...</td><td>Moderate</td></tr>
</table>
<p>Sources: Synavision CB Insights profile, https://www.cbinsights.com/company/synavision | Synavision AMEV 178 press release, https://www.synavision.de/en/news-posts/ | Synavision ai.lab, https://www.synavision.de/en/ailab/ | MarketDataForecast (Europe Energy Management Systems Market, 2024), https://www.marketdataforecast.com/market-reports/europe-energy-management-systems-market</p>
`;

const TARGET_TITLES = [
  "Executive Summary",
  "Value Proposition, Product Offering & Business Model",
  "Company Foundation, Ownership & Key Milestones",
  "Customer Profile",
  "Customer Feedback & Testimonials",
  "Competitive Landscape",
  "Leadership",
  "Sales & Go-to-Market",
  "Research & Development",
  "Market"
];

const MATCH_PATTERNS = [
  "Executive Summary(?:\\s*\\&\\s*Dedale\\s*Take)?",
  "Value Proposition(?:[,\\s]+Product Offering\\s*\\&\\s*Business Model)?",
  "(?:Company\\s+)?(?:Foundation|Ownership)(?:[,\\s]+Ownership\\s*\\&\\s*Key Milestones|\\s*\\&\\s*Key Milestones)?",
  "Customer Profile(?:s)?",
  "Customer Feedback(?:\\s*\\&\\s*Testimonials)?",
  "Competitive Landscape",
  "Leadership",
  "Sales(?:\\s*\\&\\s*Go[- ]to[- ]Market)?",
  "(?:Research\\s*\\&\\s*Development|R\\&D)(?:\\s*\\&\\s*Tech)?",
  "Market(?:\\s*Context)?"
];

async function runTest() {
  const $ = cheerio.load(mockHtml);
  const prefixPattern = `(?:[o\\s\\u2013\\u2014\\u2022-]*)(?:(?:[A-Za-z0-9]+[.:\\s\\u2013\\u2014)-]+)*)?`;
  const matchPatternsStr = MATCH_PATTERNS.join('|');
  const titleRegex = new RegExp(`^${prefixPattern}(${matchPatternsStr})\\s*$`, 'i');

  const extractedSections: { originalIndex: number; body: string }[] = [];
  let currentTargetIndex = -1;
  let currentHtmlParts: string[] = [];

  $('body').children().each((_, el) => {
    const text = $(el).text().trim();
    const match = titleRegex.exec(text);
    
    if (match) {
      const matchedTitle = match[1];
      const newTargetIndex = MATCH_PATTERNS.findIndex(pattern => new RegExp(`^${pattern}$`, 'i').test(matchedTitle));
      
      if (newTargetIndex === currentTargetIndex) return;

      if (currentTargetIndex !== -1) {
        extractedSections.push({
          originalIndex: currentTargetIndex,
          body: currentHtmlParts.join('')
        });
      }
      
      currentTargetIndex = newTargetIndex;
      currentHtmlParts = [];
    } else {
      if (currentTargetIndex !== -1) {
        currentHtmlParts.push($.html(el));
      }
    }
  });

  if (currentTargetIndex !== -1) {
    extractedSections.push({
      originalIndex: currentTargetIndex,
      body: currentHtmlParts.join('')
    });
  }

  const finalSections = TARGET_TITLES.map((title, index) => {
    const foundSection = extractedSections.find(s => s.originalIndex === index);
    let bodyHtml = foundSection ? foundSection.body : "<p>No content found for this section.</p>";

    const $body = cheerio.load(bodyHtml, null, false);
    let sectionSources: LinkData[] = [];

    const getLinksFromElement = ($el: any): LinkData[] => {
      const links: LinkData[] = [];
      $el.find('a').each((_: number, aEl: any) => {
        const href = $body(aEl).attr('href');
        let linkText = $body(aEl).text().trim();
        if (href) {
          const isNakedUrl = /^(?:https?:\/\/|www\.)[^\s]+$/i.test(linkText) || 
                             /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?$/i.test(linkText);
          
          const parentText = $el.text();
          const anchorIndex = parentText.indexOf(linkText);
          
          if (anchorIndex > 0) {
            let precedingText = parentText.substring(0, anchorIndex).trim();
            if (precedingText.includes('\n')) {
              const lines = precedingText.split('\n');
              precedingText = lines[lines.length - 1].trim();
            }
            
            const hasStructuredMarker = /[:\u2014\u2013]|(?:\s-\s)/.test(precedingText);
            
            if (hasStructuredMarker || isNakedUrl) {
              const cleanPublisher = cleanPublisherText(precedingText);
              if (cleanPublisher && cleanPublisher.length > 2 && cleanPublisher.toLowerCase() !== 'source') {
                linkText = cleanPublisher;
              }
            }
          }
          
          let cleanPublisher = cleanPublisherText(linkText);
          const isStillNaked = /^(?:https?:\/\/|www\.)[^\s]+$/i.test(cleanPublisher) || 
                               /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?$/i.test(cleanPublisher);
          if (isStillNaked || !cleanPublisher) {
            try {
              const urlObj = new URL(href.startsWith('http') ? href : 'https://' + href);
              cleanPublisher = urlObj.hostname.replace(/^www\./, '');
              cleanPublisher = cleanPublisher.charAt(0).toUpperCase() + cleanPublisher.slice(1);
            } catch (e) {
              cleanPublisher = 'Source';
            }
          }

          links.push({
            publisher: cleanPublisher,
            url: href
          });
        }
      });
      if (links.length > 0) return links;
      return extractLinks($el.text());
    };

    $body('p, li, div').each((_, el) => {
      const $el = $body(el);
      const text = $el.text().trim();
      const hasSourceMarker = /sources?\s*:/i.test(text);
      const links = getLinksFromElement($el);
      
      if (links.length > 0 && (hasSourceMarker || text.length < 300)) {
        sectionSources.push(...links);
        $el.remove();
      }
    });

    $body('h1, h2, h3, h4, h5, h6, p, li, strong, em, b').each((_, h2El) => {
      const $h2 = $body(h2El);
      const title = $h2.text().trim().toLowerCase();
      if (title === 'sources' || title === 'source' || title === 'sources:' || title === 'source:') {
        if ($h2.attr('data-subheader') === 'true' || ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(h2El.tagName)) {
          let $current = $h2.next();
          while ($current.length > 0) {
            const tagName = $current[0].tagName;
            const isHeader = $current.attr('data-subheader') === 'true' || ['h1', 'h2', 'h3'].includes(tagName);
            if (isHeader) break;
            const links = getLinksFromElement($current);
            if (links.length > 0) {
              sectionSources.push(...links);
              const $toRemove = $current;
              $current = $current.next();
              $toRemove.remove();
            } else {
              break;
            }
          }
        }
        $h2.remove();
      }
    });

    sectionSources = deduplicateAndEnhancePublishers(sectionSources);

    if (sectionSources.length > 0) {
      const label = sectionSources.length === 1 ? 'Source' : 'Sources';
      const sourcesH2 = `<h2 data-subheader="true" style="font-weight: 300; color: #1e293b; margin-top: 1.5em; margin-bottom: 0.5em; font-size: 1.25em;"><span style="font-weight: 300;">${label}</span></h2>`;
      let listHtml = `<ul style="padding-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5em;">`;
      sectionSources.forEach(link => {
        listHtml += `<li style="margin-bottom: 0.25em;"><a href="${link.url}" style="color: #2563eb; text-decoration: none;">${link.publisher}</a></li>`;
      });
      listHtml += '</ul>';
      $body.root().append(sourcesH2);
      $body.root().append(listHtml);
    }

    return {
      title,
      body: $body.html()
    };
  });

  const marketSection = finalSections.find(s => s.title === "Market");
  console.log("MARKET BODY HTML:\n", marketSection?.body);
}

runTest();
