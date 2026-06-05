import * as fs from 'fs';
import * as cheerio from 'cheerio';
import mammoth from 'mammoth';
import { extractLinks, deduplicateAndEnhancePublishers, cleanPublisherText, type LinkData } from '../src/lib/linkUtils';

const docxPath = 'C:\\Users\\L E N O V O\\Downloads\\dedale report\\Synavision — Rebuilt Report.docx';

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

async function run() {
  if (!fs.existsSync(docxPath)) {
    console.error("File does not exist:", docxPath);
    return;
  }

  const buffer = fs.readFileSync(docxPath);
  const result = await mammoth.convertToHtml({ buffer });
  const htmlContent = result.value;

  const $ = cheerio.load(htmlContent);

  // Use the corrected prefix pattern
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

  console.log("EXTRACTED SECTIONS COUNT:", extractedSections.length);

  const finalSections = TARGET_TITLES.map((title, index) => {
    const foundSection = extractedSections.find(s => s.originalIndex === index);
    let bodyHtml = foundSection ? foundSection.body : "<p>No content found for this section.</p>";

    const $body = cheerio.load(bodyHtml, null, false);
    let sectionSources: LinkData[] = [];

    const getLinksFromElement = ($el: any): LinkData[] => {
      const links: LinkData[] = [];
      let lastIndex = 0;
      const parentText = $el.text();

      $el.find('a').each((_: number, aEl: any) => {
        const href = $body(aEl).attr('href');
        let linkText = $body(aEl).text().trim();
        if (href) {
          const isNakedUrl = /^(?:https?:\/\/|www\.)[^\s]+$/i.test(linkText) || 
                             /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?$/i.test(linkText);
          
          const anchorIndex = parentText.indexOf(linkText, lastIndex);
          
          if (anchorIndex >= lastIndex) {
            let precedingText = parentText.substring(lastIndex, anchorIndex).trim();
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
            lastIndex = anchorIndex + $body(aEl).text().trim().length;
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

    console.log(`Processed Section ${index} (${title}) sources count: ${sectionSources.length}`);
    sectionSources.forEach(src => {
      console.log(`  - ${src.publisher}: ${src.url}`);
    });
  });
}

run();
