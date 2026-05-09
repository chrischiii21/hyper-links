import type { APIRoute } from 'astro';
import { marked } from 'marked';
import * as cheerio from 'cheerio';
import { generateSourceListHtml, extractLinks } from '../../lib/linkUtils';

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

const SUB_HEADERS = [
  "Company Overview",
  "Value Proposition",
  "Product Overview",
  "Business Model",
  "Pricing Structure",
  "Prices",
  "Contract Length",
  "Additional Important Note",
  "Founding Details & Initial Focus",
  "Company Evolution",
  "Strategic Milestones",
  "Customer Geography",
  "Customer Size",
  "Customer Industry",
  "Buying Personas",
  "Adoption Trigger & Pain Points",
  "Key Purchasing Criteria",
  "Customer Level of Satisfaction",
  "Customer ROI",
  "Offering Strengths",
  "Points of Improvement",
  "Level of Criticality",
  "Level of Stickiness",
  "Leadership Summary",
  "Leadership Team",
  "Team Stability",
  "Sales Channels & Partner Strategy",
  "Sales Organization",
  "Go-To-Market Strategy",
  "Product Capability",
  "R&D Capability",
  "R&D Team",
  "AI Development",
  "Market Definition",
  "Market Characteristics",
  "Market Trends",
  "Sources"
];

// Mapping from Roman Numeral/Section header to target index
const SECTION_MAP: Record<string, number> = {
  "I": 0, "II": 1, "III": 2, "IV": 3, "V": 4, 
  "VI": 5, "VII": 6, "VIII": 7, "IX": 8, "X": 9
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const { text } = await request.json();

    if (!text) {
      return new Response(JSON.stringify({ error: 'No text provided' }), { status: 400 });
    }

    const lines = text.split('\n');
    let isInRebuiltReport = false;
    let currentSectionIndex = -1;
    let sectionContents: string[] = Array(10).fill('');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.includes('Part 2: Rebuilt Report')) {
        isInRebuiltReport = true;
        continue;
      }
      if (line.includes('Part 3: Rebuilt Research Tags')) {
        isInRebuiltReport = false;
        continue;
      }

      if (isInRebuiltReport) {
        const sectionMatch = line.match(/^#\s+Section\s+([IVX]+)/i);
        if (sectionMatch) {
          const roman = sectionMatch[1].toUpperCase();
          if (SECTION_MAP[roman] !== undefined) {
            currentSectionIndex = SECTION_MAP[roman];
            continue;
          }
        }

        if (currentSectionIndex !== -1) {
          sectionContents[currentSectionIndex] += lines[i] + '\n';
        }
      }
    }

    const finalSections = await Promise.all(TARGET_TITLES.map(async (title, index) => {
      const rawMarkdown = sectionContents[index].trim();
      let htmlBody = '';
      
      if (!rawMarkdown) {
        htmlBody = "<p>No content found for this section.</p>";
      } else {
        const rawHtml = await marked.parse(rawMarkdown);
        const $ = cheerio.load(rawHtml, null, false);

        // --- TABLE BULLET FORMATTING (Same as extract.ts) ---
        const formatCellAsBullets = (cell: any) => {
          let rawHtml = cell.html() || '';
          rawHtml = rawHtml.replace(/<br\s*\/?>/gi, '\n');
          rawHtml = rawHtml.replace(/<\/p>\s*<p[^>]*>/gi, '\n');
          let text = rawHtml.replace(/<[^>]+>/g, '').trim();
          
          const hasNewlines = text.includes('\n');
          const hasBullets = (text.match(/[•\u2022]/g) || []).length > 0;
          
          let rawItems: string[] = [];
          if (hasNewlines) {
            rawItems = text.split('\n');
          } else if (hasBullets) {
            rawItems = text.split(/[•\u2022]/);
          } else if (text.includes(';')) {
            rawItems = text.split(';');
          } else {
            rawItems = [text];
          }

          let listHtml = '<ul style="list-style-type: disc; padding-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0;">';
          let validItems = 0;
          rawItems.forEach((item: string) => {
            let cleanItem = item.replace(/^[•\-\u2022\u2013\u2014\s\t*]+/, '').trim();
            if (cleanItem) {
              listHtml += `<li style="margin-bottom: 0.25em;">${cleanItem}</li>`;
              validItems++;
            }
          });
          listHtml += '</ul>';

          if (validItems > 0 && (validItems > 1 || hasBullets || hasNewlines)) {
            cell.html(listHtml);
          }
        };

        $('table').each((_, tableEl) => {
          let keyFuncColIndex = -1;
          $(tableEl).find('tr').first().find('th, td').each((colIndex, cellEl) => {
            if ($(cellEl).text().trim().toLowerCase().includes('key functionalities')) {
              keyFuncColIndex = colIndex;
            }
          });

          if (keyFuncColIndex !== -1) {
            $(tableEl).find('tr').each((rowIndex, rowEl) => {
              if (rowIndex === 0) return;
              const targetCell = $(rowEl).find('td').eq(keyFuncColIndex);
              if (targetCell.length > 0) formatCellAsBullets(targetCell);
            });
          }

          $(tableEl).find('tr').each((_, rowEl) => {
            const firstCell = $(rowEl).find('th, td').first();
            if (firstCell.text().trim().toLowerCase().includes('key functionalities')) {
              const nextCell = firstCell.next('td');
              if (nextCell.length > 0) formatCellAsBullets(nextCell);
            }
          });
        });

        // --- SUB-HEADER PROCESSING (Same as extract.ts) ---
        const escapedSubHeaders = SUB_HEADERS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const prefixPattern = `(?:[o\\-\\u2013\\u2014\\u2022\\s]*)(?:(?:[A-Za-z0-9]+[.\\-\\u2013\\u2014)\\s]+)*)?`;
        const subHeaderRegex = new RegExp(`^${prefixPattern}(${escapedSubHeaders})(?:\\s*[:\\-\\u2013\\u2014]\\s*(.+)|\\s*)$`, 'is');
        const titleRegexHtml = new RegExp(`^(?:<[^>]+>|\\s)*${prefixPattern}(${escapedSubHeaders})(?:<[^>]+>|\\s)*[:\\-\\u2013\\u2014]?(?:<[^>]+>|\\s)*`, 'i');

        $('p, li, h1, h2, h3, h4, h5, h6, span, strong, b').each((_, el) => {
          const text = $(el).text().trim();
          const match = subHeaderRegex.exec(text);
          
          if (match) {
            let innerText = match[1];
            const remainingText = match[2];
            
            if (innerText.toLowerCase() === 'company overview') {
              innerText = '%%COMPANY_OVERVIEW_PLACEHOLDER%%';
            }
            
            const h2Html = `<h2 data-subheader="true" style="font-weight: 300; color: #1e293b; margin-top: 1.5em; margin-bottom: 0.5em; font-size: 1.25em;"><span style="font-weight: 300;">${innerText}</span></h2>`;
            
            if (['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(el.tagName)) {
              if (remainingText && remainingText.trim().length > 0) {
                // SPECIAL CASE: Beautify links for Sources
                if (innerText.toLowerCase() === 'sources') {
                  const links = extractLinks(remainingText);
                  if (links.length > 0) {
                    const pluralizedLabel = links.length === 1 ? 'Source' : 'Sources';
                    const pluralizedH2Html = `<h2 data-subheader="true" style="font-weight: 300; color: #1e293b; margin-top: 1.5em; margin-bottom: 0.5em; font-size: 1.25em;"><span style="font-weight: 300;">${pluralizedLabel}</span></h2>`;
                    const linksHtml = generateSourceListHtml(remainingText);
                    $(el).replaceWith(`${pluralizedH2Html}\n${linksHtml}`);
                    return;
                  }
                }

                // For Executive Summary (index 0), we keep li inline as per user request
                if (el.tagName === 'li' && index === 0) {
                  // Even if inline, ensure it's not bold
                  $(el).find('strong, b').each((_, boldEl) => {
                    const boldText = $(boldEl).text().trim();
                    if (SUB_HEADERS.some(sh => boldText.toLowerCase().includes(sh.toLowerCase()))) {
                      $(boldEl).replaceWith($(boldEl).html() || '');
                    }
                  });

                  if (match[1].toLowerCase() === 'company overview') {
                    const rawHtml = $(el).html() || '';
                    $(el).html(rawHtml.replace(/company overview/i, '%%COMPANY_OVERVIEW_PLACEHOLDER%%'));
                  }
                  return;
                }

                let finalHtml = remainingText.trim();
                const rawHtml = $(el).html() || '';
                const htmlMatch = titleRegexHtml.exec(rawHtml);
                if (htmlMatch) {
                  finalHtml = rawHtml.substring(htmlMatch[0].length).trim();
                }
                
                // For sections other than Executive Summary, separate inline headers to new line
                const newTag = 'p';
                $(el).replaceWith(`${h2Html}\n<${newTag}>${finalHtml}</${newTag}>`);
              } else {
                $(el).replaceWith(h2Html);
              }
            }
          }
        });

        // POST-PROCESS: Find "Sources" headers and beautify the content following them
        $('h2[data-subheader="true"]').each((_, h2El) => {
          const $h2 = $(h2El);
          if ($h2.text().trim().toLowerCase() === 'sources') {
            const $next = $h2.next();
            if ($next.length > 0 && !($next.attr('data-subheader') === 'true' || ['h1', 'h2', 'h3'].includes($next[0].tagName))) {
              const text = $next.text().trim();
              const links = extractLinks(text);
              if (links.length > 0) {
                // Pluralize the header based on count
                const label = links.length === 1 ? 'Source' : 'Sources';
                $h2.find('span').text(label);
                
                const linksHtml = generateSourceListHtml(text);
                $next.replaceWith(linksHtml);
              }
            }
          }
        });

        // Link extraction utility moved to src/lib/linkUtils.ts

        let bodyHtml = $.html();
        if (index === 0) {
          bodyHtml = bodyHtml.replace(/%%COMPANY_OVERVIEW_PLACEHOLDER%%/g, 'Company Overview');
        } else {
          bodyHtml = bodyHtml.replace(/%%COMPANY_OVERVIEW_PLACEHOLDER%%/g, 'Value Proposition');
        }

        const $final = cheerio.load(bodyHtml, null, false);
        $final('h1, h2, h3, h4, h5, h6').each((_, el) => {
          // Remove <strong> and <b> wrappers inside the header
          $final(el).find('strong, b').each((_, boldEl) => {
            $final(boldEl).replaceWith($final(boldEl).html() || '');
          });

          // Apply strict inline unbolding styles
          const isMainTitle = !$(el).attr('data-subheader');
          const fontSize = isMainTitle ? '1.5em' : '1.25em';
          const marginTop = isMainTitle ? '2em' : '1.5em';
          
          $final(el).attr('style', `font-weight: 300; color: #1e293b; margin-top: ${marginTop}; margin-bottom: 0.5em; font-size: ${fontSize};`);

          // Wrap inner text to force word processors to respect it
          const inner = $final(el).html() || '';
          if (!inner.includes('<span style="font-weight: 300;"')) {
            $final(el).html(`<span style="font-weight: 300;">${inner}</span>`);
          }
        });

        $final('table').attr('style', 'width: 100%; border-collapse: collapse; margin: 1em 0;');
        $final('th, td').attr('style', 'border: 1px solid #e2e8f0; padding: 0.75rem; text-align: left;');
        $final('th').attr('style', 'border: 1px solid #e2e8f0; padding: 0.75rem; text-align: left; background-color: #f8fafc; font-weight: 600;');

        htmlBody = $final.html();
      }

      return {
        id: index + 1,
        title: title,
        body: htmlBody
      };
    }));

    return new Response(JSON.stringify(finalSections), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Extraction error:', error);
    return new Response(JSON.stringify({ error: 'Failed to process pasted text' }), { status: 500 });
  }
};
