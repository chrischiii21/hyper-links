import type { APIRoute } from 'astro';
import mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import { PDFParse } from 'pdf-parse';
import { generateSourceListHtml } from '../../lib/linkUtils';

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

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file uploaded' }), { status: 400 });
    }

    let htmlContent = '';
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.docx')) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ buffer: Buffer.from(arrayBuffer) });
      htmlContent = result.value;
    } else if (fileName.endsWith('.pdf')) {
      const arrayBuffer = await file.arrayBuffer();
      const parser = new PDFParse({ data: new Uint8Array(arrayBuffer) });
      const result = await parser.getText();
      htmlContent = result.text.split('\n').map(line => `<p>${line}</p>`).join('');
    } else {
      const rawText = await file.text();
      htmlContent = rawText.split('\n').map(line => `<p>${line}</p>`).join('');
    }

    const $ = cheerio.load(htmlContent);

    // 1. Process Sub-Headers: Find target phrases and convert them to <h2> with font-weight normal
    const escapedSubHeaders = SUB_HEADERS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    
    // Regex pattern to match optional bullets, dashes, Roman numerals, letters, numbers, and em/en dashes
    const prefixPattern = `(?:[o\\-\\u2013\\u2014\\u2022\\s]*)(?:(?:[A-Za-z0-9]+[.\\-\\u2013\\u2014)\\s]+)*)?`;
    
    // Match the sub-header text, ignoring complex prefixes.
    // Captures the title (Group 1) and any remaining text (Group 2)
    const subHeaderRegex = new RegExp(`^${prefixPattern}(${escapedSubHeaders})(?:\\s*[:\\-\\u2013\\u2014]\\s*(.+)|\\s*)$`, 'is');
    
    // Regex for HTML matching to preserve tags
    const titleRegexHtml = new RegExp(`^(?:<[^>]+>|\\s)*${prefixPattern}(${escapedSubHeaders})(?:<[^>]+>|\\s)*[:\\-\\u2013\\u2014]?(?:<[^>]+>|\\s)*`, 'i');

    $('p, li, h1, h2, h3, h4, h5, h6, span, strong, b').each((_, el) => {
      const text = $(el).text().trim();
      const match = subHeaderRegex.exec(text);
      
      if (match) {
        let innerText = match[1];
        const remainingText = match[2];
        
        // Use a placeholder so we can dynamically resolve it based on the section it ends up in
        if (innerText.toLowerCase() === 'company overview') {
          innerText = '%%COMPANY_OVERVIEW_PLACEHOLDER%%';
        }
        
        const h2Html = `<h2 data-subheader="true" style="font-weight: 300; color: #1e293b; margin-top: 1.5em; margin-bottom: 0.5em; font-size: 1.25em;"><span style="font-weight: 300;">${innerText}</span></h2>`;
        
        if (['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(el.tagName)) {
          if (remainingText && remainingText.trim().length > 0) {
            // SPECIAL CASE: If this is a "Sources" header with inline links, format them beautifully
            if (innerText.toLowerCase() === 'sources') {
              const linksHtml = generateSourceListHtml(remainingText);
              if (linksHtml !== remainingText) {
                $(el).replaceWith(`${h2Html}\n${linksHtml}`);
                return;
              }
            }

            // If it's an inline sub-header inside a bullet point, the user wants to retain the bullet.
            // We skip replacing it, leaving it as a normal inline list item.
            if (el.tagName === 'li') {
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
            
            const newTag = el.tagName === 'li' ? 'li' : 'p';
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
        let $next = $h2.next();
        while ($next.length > 0 && !($next.attr('data-subheader') === 'true' || ['h1', 'h2', 'h3'].includes($next[0].tagName))) {
          const text = $next.text().trim();
          const linksHtml = generateSourceListHtml(text);
          if (linksHtml !== text) {
            $next.replaceWith(linksHtml);
          }
          $next = $h2.nextAll().filter((i, el) => !$(el).is($next)).first();
          break; 
        }
      }
    });

    // Link extraction utility has been moved to src/lib/linkUtils.ts

    // Pre-process tables to format specific cells (like "Key functionalities") into bullet points
    const formatCellAsBullets = (cell: any) => {
      let rawHtml = cell.html() || '';
      // Convert typical line breaks into newlines
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

      // Only apply if we actually found multiple items or explicit separators
      if (validItems > 0 && (validItems > 1 || hasBullets || hasNewlines)) {
        cell.html(listHtml);
      }
    };

    $('table').each((_, tableEl) => {
      // Check for column-based table (headers in the first row)
      let keyFuncColIndex = -1;
      $(tableEl).find('tr').first().find('th, td').each((colIndex, cellEl) => {
        if ($(cellEl).text().trim().toLowerCase().includes('key functionalities')) {
          keyFuncColIndex = colIndex;
        }
      });

      if (keyFuncColIndex !== -1) {
        $(tableEl).find('tr').each((rowIndex, rowEl) => {
          if (rowIndex === 0) return; // Skip header
          const targetCell = $(rowEl).find('td').eq(keyFuncColIndex);
          if (targetCell.length > 0) {
            formatCellAsBullets(targetCell);
          }
        });
      }

      // Check for row-based table (header in the first column)
      $(tableEl).find('tr').each((_, rowEl) => {
        const firstCell = $(rowEl).find('th, td').first();
        if (firstCell.text().trim().toLowerCase().includes('key functionalities')) {
          const nextCell = firstCell.next('td');
          if (nextCell.length > 0) {
            formatCellAsBullets(nextCell);
          }
        }
      });
    });

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

    const matchPatternsStr = MATCH_PATTERNS.join('|');
    // Match the main section titles with the same robust prefix pattern
    const titleRegex = new RegExp(`^${prefixPattern}(${matchPatternsStr})\\s*$`, 'i');

    const extractedSections: { originalIndex: number; body: string }[] = [];
    
    let currentTargetIndex = -1;
    let currentHtmlParts: string[] = [];

    // Iterate through top-level elements to preserve HTML structure
    $('body').children().each((_, el) => {
      // If this element is a sub-header we generated, DO NOT treat it as a main section title!
      if ($(el).attr('data-subheader') === 'true') {
        if (currentTargetIndex !== -1) {
          currentHtmlParts.push($.html(el));
        }
        return;
      }

      // Get the plain text of this block to check if it's a title
      const text = $(el).text().trim();
      const match = titleRegex.exec(text);
      
      if (match) {
        const matchedTitle = match[1];
        const newTargetIndex = MATCH_PATTERNS.findIndex(pattern => new RegExp(`^${pattern}$`, 'i').test(matchedTitle));
        
        if (newTargetIndex === currentTargetIndex) {
          // This is a repeated header for the exact same section. Ignore it so it doesn't appear in body.
          return;
        }

        // Save the previous section if we were capturing one
        if (currentTargetIndex !== -1) {
          const existing = extractedSections.find(s => s.originalIndex === currentTargetIndex);
          if (existing) {
            existing.body += currentHtmlParts.join('');
          } else {
            extractedSections.push({
              originalIndex: currentTargetIndex,
              body: currentHtmlParts.join('')
            });
          }
        }
        
        // Start capturing the new section
        currentTargetIndex = newTargetIndex;
        currentHtmlParts = [];
      } else {
        // Not a title, append the HTML of this element if we're in a section
        if (currentTargetIndex !== -1) {
          currentHtmlParts.push($.html(el));
        }
      }
    });

    // Don't forget to push the very last section
    if (currentTargetIndex !== -1) {
      const existing = extractedSections.find(s => s.originalIndex === currentTargetIndex);
      if (existing) {
        existing.body += currentHtmlParts.join('');
      } else {
        extractedSections.push({
          originalIndex: currentTargetIndex,
          body: currentHtmlParts.join('')
        });
      }
    }

    // Create the final 10 sections in exact order
    const finalSections = TARGET_TITLES.map((title, index) => {
      const foundSection = extractedSections.find(s => s.originalIndex === index);
      let bodyHtml = foundSection ? foundSection.body : "<p>No content found for this section.</p>";

      // Resolve the dynamic "Company Overview" placeholder depending on the section
      if (index === 0) { // Executive Summary
        bodyHtml = bodyHtml.replace(/%%COMPANY_OVERVIEW_PLACEHOLDER%%/g, 'Company Overview');
      } else { // All other sections
        bodyHtml = bodyHtml.replace(/%%COMPANY_OVERVIEW_PLACEHOLDER%%/g, 'Value Proposition');
      }

      // AGGRESSIVE UNBOLDING PASS: Catch native Word <h2> tags and strip inner strong/b tags
      const $body = cheerio.load(bodyHtml, null, false);
      $body('h1, h2, h3, h4, h5, h6').each((_, el) => {
        // Remove <strong> and <b> wrappers inside the header
        $body(el).find('strong, b').each((_, boldEl) => {
          $body(boldEl).replaceWith($body(boldEl).html() || '');
        });

        // Apply strict inline unbolding styles for the clipboard
        const isMainTitle = !$body(el).attr('data-subheader');
        const fontSize = isMainTitle ? '1.5em' : '1.25em';
        const marginTop = isMainTitle ? '2em' : '1.5em';
        
        $body(el).attr('style', `font-weight: 300; color: #1e293b; margin-top: ${marginTop}; margin-bottom: 0.5em; font-size: ${fontSize};`);

        // Wrap inner text to force word processors to respect it
        const inner = $body(el).html() || '';
        if (!inner.includes('<span style="font-weight: 300;"')) {
          $body(el).html(`<span style="font-weight: 300;">${inner}</span>`);
        }
      });

      return {
        id: index + 1,
        title: title, // Only retain the section name, no Roman Numerals
        body: $body.html()
      };
    });

    return new Response(JSON.stringify(finalSections), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Extraction error:', error);
    return new Response(JSON.stringify({ error: 'Failed to process document' }), { status: 500 });
  }
};
