import type { APIRoute } from 'astro';
import * as cheerio from 'cheerio';
import { generateSourceListHtml, extractLinks, deduplicateAndEnhancePublishers, cleanPublisherText, isPureSourceBlock, type LinkData } from '../../lib/linkUtils';

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

const prefixPattern = `(?:[o\\s\\u2013\\u2014\\u2022-]*)(?:(?:[A-Za-z0-9]+[.:\\s\\u2013\\u2014)-]+)*)?`;
const titleRegex = new RegExp(`^${prefixPattern}(${MATCH_PATTERNS.join('|')})\\s*$`, 'i');

const SUB_HEADERS = [
  "Company Overview",
  "Product Overview",
  "Product Offering",
  "Business Model",
  "Pricing Structure",
  "Prices",
  "Contract Length",
  "Additional Important Note",
  "Additional Note",
  "Company Foundation",
  "Founding Details & Initial Focus",
  "Founding Details and Initial Focus", 
  "Company Evolution",
  "Strategic Milestones",
  "Customer Overview",
  "Customers Overview",
  "Customer Geography",
  "Customer Size",
  "Customer Industry",
  "Buying Personas",
  "Adoption Trigger & Pain Points",
  "Adoption Triggers & Pain Points",
  "Adoption Triggers and Pain Points",
  "Key Purchasing Criteria",
  "Customer Feedback",
  "Customer Feedback & Testimonials",
  "Customer Level of Satisfaction",
  "Customer ROI",
  "Offering Strengths",
  "Points of Improvement",
  "Level of Criticality",
  "Level of Stickiness",
  "Leadership Summary",
  "Team Stability",
  "Sales Channels & Partner Strategy",
  "Sales Channels and Partner Strategy",
  "Sales Organization",
  "Go-To-Market Strategy",
  "Sales & Go-To-Market",
  "Product Capability",
  "R&D Capability",
  "R&D Team",
  "Research & Development",
  "AI Development",
  "Market Definition",
  "Market Characteristics",
  "Market Trends",
  "Platform Competition",
  "Adjacent Competition",
  "Point Solution Competition",
  "Competitive Landscape",
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
      const { default: mammoth } = await import('mammoth');
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ buffer: Buffer.from(arrayBuffer) });
      htmlContent = result.value;
    } else if (fileName.endsWith('.pdf')) {
      try {
        const { PDFParse } = await import('pdf-parse');
        const arrayBuffer = await file.arrayBuffer();
        const parser = new PDFParse({ data: new Uint8Array(arrayBuffer) });
        const result = await parser.getText();
        htmlContent = result.text.split('\n').map(line => `<p>${line}</p>`).join('');
      } catch (pdfError) {
        console.error('PDF parsing library error:', pdfError);
        throw new Error('PDF processing is currently unavailable on the server. Please try DOCX or paste text.');
      }
    } else {
      const rawText = await file.text();
      htmlContent = rawText.split('\n').map(line => `<p>${line}</p>`).join('');
    }

    const $ = cheerio.load(htmlContent);

    // PRE-PROCESS: Remove empty paragraphs or those containing only &nbsp; or <br>
    $('p, div, span').each((_, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      const html = $el.html() || '';
      if (!text && (html === '' || html === '&nbsp;' || html === '<br>' || html === '<br/>')) {
        $el.remove();
      }
    });

    // Helper to identify the section index of an element in the DOM
    const getSectionIndexForElement = (el: any): number => {
      let $parent = $(el);
      while ($parent.length > 0 && $parent.parent().length > 0 && $parent.parent()[0].tagName !== 'body') {
        $parent = $parent.parent();
      }
      if ($parent.length === 0) return -1;
      
      const parentEl = $parent[0];
      let currentIdx = -1;
      let found = false;
      
      $('body').children().each((_, child) => {
        if (found) return;
        if (child === parentEl) {
          found = true;
          return;
        }
        
        const text = $(child).text().trim();
        const match = titleRegex.exec(text);
        if (match) {
          const matchedTitle = match[1];
          currentIdx = MATCH_PATTERNS.findIndex(pattern => new RegExp(`^${pattern}$`, 'i').test(matchedTitle));
        }
      });
      
      return currentIdx;
    };

    // 1. Process Sub-Headers: Find target phrases and convert them to <h2> with font-weight normal
    const escapedSubHeaders = SUB_HEADERS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    
    // Match the sub-header text, ignoring complex prefixes. Optional colon/dash at the end.
    const subHeaderRegex = new RegExp(`^${prefixPattern}(${escapedSubHeaders})\\s*[:\\-\\u2013\\u2014]?\\s*(.*)$`, 'is');
    
    // Regex for HTML matching to preserve tags
    const titleRegexHtml = new RegExp(`^(?:<[^>]+>|\\s)*${prefixPattern}(${escapedSubHeaders})(?:<[^>]+>|\\s)*[:\\-\\u2013\\u2014]?(?:<[^>]+>|\\s)*`, 'i');

    $('p, li, h1, h2, h3, h4, h5, h6, span, strong, b, em, i').each((_, el) => {
      // Skip sub-header conversion for elements inside the Executive Summary (index 0)
      if (getSectionIndexForElement(el) === 0) return;
      const $el = $(el);
      const text = $el.text().trim();
      
      // Clean up the text for comparison (remove trailing colon etc)
      const cleanCompareText = text.replace(/[:\-\u2013\u2014]$/, '').trim();
      
      const match = subHeaderRegex.exec(text);
      
      if (match) {
        let innerText = match[1];
        const remainingText = match[2];
        
        // Map matched subheader text to its exact canonical Title Case equivalent from SUB_HEADERS
        const normalizeForComparison = (str: string) => {
          return str
            .toLowerCase()
            .replace(/\b(and|&)\b/g, 'and')
            .replace(/[^a-z0-9]/g, '')
            .trim();
        };

        const normalizedInner = normalizeForComparison(innerText);

        // Check if there is already a header with this text directly preceding
        let $block = $el;
        while ($block.length > 0 && ['span', 'strong', 'b', 'em', 'i'].includes($block[0].tagName)) {
          $block = $block.parent();
        }
        let hasDuplicateH2Preceding = false;
        const $prevBlock = $block.prev();
        if ($prevBlock.length > 0) {
          const prevTagName = $prevBlock[0].tagName.toLowerCase();
          const isHeader = /^h[1-6]$/.test(prevTagName) || $prevBlock.attr('data-subheader') === 'true';
          if (isHeader && normalizeForComparison($prevBlock.text().trim()) === normalizedInner) {
            hasDuplicateH2Preceding = true;
          }
        }
        if (hasDuplicateH2Preceding) return;

        const canonicalHeader = SUB_HEADERS.find(h => normalizeForComparison(h) === normalizedInner);
        if (canonicalHeader) {
          innerText = canonicalHeader;
        }

        // Use a placeholder so we can dynamically resolve it based on the section it ends up in
        if (innerText.toLowerCase() === 'company overview') {
          innerText = '%%COMPANY_OVERVIEW_PLACEHOLDER%%';
        }
        
        if (innerText.toLowerCase() === 'additional note' || innerText.toLowerCase() === 'additional notes') {
          innerText = 'Additional Important Note';
        }
        
        // SPECIAL CASE: Ensure we don't convert a main section title into a sub-header
        const matchesMainTitle = MATCH_PATTERNS.some(pattern => 
          new RegExp(`^${prefixPattern}${pattern}\\s*$`, 'i').test(cleanCompareText)
        );
        if (matchesMainTitle) return;

        const h2Html = `<h2 data-subheader="true" style="font-weight: 300; color: #1e293b; margin-top: 1.5em; margin-bottom: 0.5em; font-size: 1.25em;"><span style="font-weight: 300;">${innerText}</span></h2>`;
        
        if (['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'em', 'i', 'strong', 'b'].includes(el.tagName)) {
          if (remainingText && remainingText.trim().length > 0) {
            // SPECIAL CASE: If this is a "Sources" header with inline links, format them beautifully
            if (innerText.toLowerCase().startsWith('source')) {
              const links = extractLinks(remainingText);
              if (links.length > 0) {
                const pluralizedLabel = links.length === 1 ? 'Source' : 'Sources';
                const pluralizedH2Html = `<h2 data-subheader="true" style="font-weight: 300; color: #1e293b; margin-top: 1.5em; margin-bottom: 0.5em; font-size: 1.25em;"><span style="font-weight: 300;">${pluralizedLabel}</span></h2>`;
                const linksHtml = generateSourceListHtml(remainingText);
                
                // If the element is a child of another block (like span inside p), 
                // we should try to replace the parent if the parent is just a wrapper.
                const $parent = $(el).parent();
                if ($parent.length > 0 && ['p', 'div'].includes($parent[0].tagName) && $parent.text().trim() === text) {
                  $parent.replaceWith(`${pluralizedH2Html}\n${linksHtml}`);
                } else {
                  $(el).replaceWith(`${pluralizedH2Html}\n${linksHtml}`);
                }
                return;
              }
            }


            let finalHtml = remainingText.trim();
            const rawHtml = $(el).html() || '';
            const htmlMatch = titleRegexHtml.exec(rawHtml);
            if (htmlMatch) {
              finalHtml = rawHtml.substring(htmlMatch[0].length).trim();
            }
            
            // Clean up leading punctuation and spaces (e.g. leading periods, colons, dashes, bullets)
            finalHtml = finalHtml.replace(/^[.\s,;:\-\u2013\u2014\u2022]+/, '').trim();
            
            if (finalHtml.length > 0) {
              const newTag = el.tagName === 'li' ? 'li' : 'p';
              $(el).replaceWith(`${h2Html}\n<${newTag}>${finalHtml}</${newTag}>`);
            } else {
              $(el).replaceWith(h2Html);
            }
          } else {
            $(el).replaceWith(h2Html);
          }
        }
      }
    });

    // POST-PROCESS: Group Competition entries into a single bulleted list
    $('h2[data-subheader="true"]').each((_, h2El) => {
      const $h2 = $(h2El);
      const title = $h2.text().trim().toLowerCase();
      const compTitles = ['platform competition', 'adjacent competition', 'point solution competition'];
      
      if (compTitles.includes(title)) {
        let $currentH2 = $h2;
        let compEntries: { title: string, body: string }[] = [];
        let elementsToRemove: any[] = [];

        // Look for consecutive competition entries
        while ($currentH2.length > 0) {
          const currentTitle = $currentH2.text().trim().replace(/:$/, '').trim();
          const currentTitleLower = currentTitle.toLowerCase();
          
          if (compTitles.includes(currentTitleLower)) {
            const $next = $currentH2.next();
            if ($next.length > 0 && !(['h1', 'h2', 'h3'].includes($next[0].tagName))) {
              compEntries.push({
                title: currentTitle,
                body: $next.text().trim()
              });
              elementsToRemove.push($currentH2, $next);
              
              // Jump to the next possible H2
              let $candidate = $next.next();
              while ($candidate.length > 0 && $candidate[0].tagName !== 'h2') {
                $candidate = $candidate.next();
              }
              $currentH2 = $candidate;
              continue;
            }
          }
          break;
        }

        if (compEntries.length > 0) {
          let listHtml = `<ul style="padding-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5em;">`;
          compEntries.forEach(entry => {
            listHtml += `<li style="margin-bottom: 0.5em; line-height: 1.5; color: #334155;"><strong>${entry.title}:</strong> ${entry.body}</li>`;
          });
          listHtml += '</ul>';
          
          // Replace the first element and remove the rest
          elementsToRemove[0].replaceWith(listHtml);
          for (let i = 1; i < elementsToRemove.length; i++) {
            elementsToRemove[i].remove();
          }
        }
      }
    });

    // --- CONSOLIDATED SOURCE EXTRACTION ---
    // Scan all elements for "Source:" markers, extract links, remove original elements,
    // and append a consolidated list at the end of each section later in the loop.
    // NOTE: This logic is moved inside the sections loop for better section-specific consolidation.

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

      let listHtml = '<ul style="padding-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0;">';
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

    // MATCH_PATTERNS is defined at the top of the file

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

      // SPECIAL CRITERIA: For Executive Summary (index 0), transform all H2 sub-headers into bullet points
      if (index === 0) {
        const $es = cheerio.load(bodyHtml, null, false);

        // Convert any tables in Executive Summary into bullet points
        $es('table').each((_, tableEl) => {
          const $table = $es(tableEl);
          const listItems: string[] = [];
          $table.find('tr').each((_, trEl) => {
            const cells = $es(trEl).find('td, th');
            if (cells.length === 2) {
              const keyText = $es(cells[0]).text().trim();
              const valueHtml = $es(cells[1]).html() || '';
              const valueText = $es(cells[1]).text().trim();
              
              if (keyText && valueText) {
                const $val = cheerio.load(valueHtml, null, false);
                $val('p, div, h1, h2, h3, h4, h5, h6').each((_, blockEl) => {
                  const $block = $val(blockEl);
                  $block.replaceWith($block.html() || '');
                });

                let cleanKey = keyText.replace(/:$/, '').trim();
                let cleanValue = $val.html() || '';
                cleanValue = cleanValue.replace(/^[•\-\u2022\u2013\u2014\s\t*:]+/, '').trim();
                
                listItems.push(`<li style="margin-bottom: 0.5em; line-height: 1.5; color: #334155;"><strong>${cleanKey}:</strong> ${cleanValue}</li>`);
              } else if (keyText || valueText) {
                const targetHtml = keyText ? $es(cells[0]).html() || '' : valueHtml;
                const $val = cheerio.load(targetHtml, null, false);
                $val('p, div, h1, h2, h3, h4, h5, h6').each((_, blockEl) => {
                  const $block = $val(blockEl);
                  $block.replaceWith($block.html() || '');
                });
                let cleanHtml = $val.html() || '';
                cleanHtml = cleanHtml.replace(/^[•\-\u2022\u2013\u2014\s\t*:]+/, '').trim();
                listItems.push(`<li style="margin-bottom: 0.5em; line-height: 1.5; color: #334155;">${cleanHtml}</li>`);
              }
            } else if (cells.length === 1) {
              let cellHtml = $es(cells[0]).html() || '';
              const $val = cheerio.load(cellHtml, null, false);
              $val('p, div, h1, h2, h3, h4, h5, h6').each((_, blockEl) => {
                const $block = $val(blockEl);
                $block.replaceWith($block.html() || '');
              });
              let cleanHtml = $val.html() || '';
              cleanHtml = cleanHtml.replace(/^[•\-\u2022\u2013\u2014\s\t*:]+/, '').trim();
              if (cleanHtml) {
                listItems.push(`<li style="margin-bottom: 0.5em; line-height: 1.5; color: #334155;">${cleanHtml}</li>`);
              }
            } else if (cells.length > 2) {
              const firstCellText = $es(cells[0]).text().trim();
              let cleanKey = firstCellText.replace(/:$/, '').trim();
              
              const remainingHtmlParts: string[] = [];
              cells.slice(1).each((_, cell) => {
                let cellHtml = $es(cell).html() || '';
                const $val = cheerio.load(cellHtml, null, false);
                $val('p, div, h1, h2, h3, h4, h5, h6').each((_, blockEl) => {
                  const $block = $val(blockEl);
                  $block.replaceWith($block.html() || '');
                });
                let cleanCell = $val.html() || '';
                cleanCell = cleanCell.replace(/^[•\-\u2022\u2013\u2014\s\t*:]+/, '').trim();
                if (cleanCell) {
                  remainingHtmlParts.push(cleanCell);
                }
              });
              
              const remainingHtml = remainingHtmlParts.join(' - ');
              if (cleanKey && remainingHtml) {
                listItems.push(`<li style="margin-bottom: 0.5em; line-height: 1.5; color: #334155;"><strong>${cleanKey}:</strong> ${remainingHtml}</li>`);
              } else {
                const combined = [cleanKey, remainingHtml].filter(Boolean).join(' - ');
                if (combined) {
                  listItems.push(`<li style="margin-bottom: 0.5em; line-height: 1.5; color: #334155;">${combined}</li>`);
                }
              }
            }
          });
          if (listItems.length > 0) {
            const listHtml = `<ul style="padding-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5em;">\n${listItems.join('\n')}\n</ul>`;
            $table.replaceWith(listHtml);
          } else {
            $table.remove();
          }
        });

        $es('h2').each((_, h2El) => {
          const $h2 = $es(h2El);
          const h2Text = $h2.text().trim().replace(/:$/, '');
          
          // Only transform if it is NOT a "Source" header
          const isSourceHeader = h2Text.toLowerCase().includes('source');
          if (isSourceHeader || !h2Text) return;

          let combinedBody = '';
          let $next = $h2.next();
          while ($next.length > 0 && !['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes($next[0].tagName)) {
            const textBlock = $next.text().trim().replace(/^[•\-\u2022\u2013\u2014\s\t*]+/, '');
            if (textBlock) {
              combinedBody += (combinedBody ? ' ' : '') + textBlock;
            }
            const $toRemove = $next;
            $next = $next.next();
            $toRemove.remove();
          }
          
          const listItemHtml = `<ul style="padding-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5em;">
            <li style="margin-bottom: 0.5em; line-height: 1.5; color: #334155;"><strong>${h2Text}:</strong> ${combinedBody}</li>
          </ul>`;
          $h2.replaceWith(listItemHtml);
        });

        // Merge consecutive <ul> tags for a cleaner look
        $es('ul + ul').each((_, ulEl) => {
          const $ul = $es(ulEl);
          const $prev = $ul.prev('ul');
          if ($prev.length > 0) {
            $prev.append($ul.contents());
            $ul.remove();
          }
        });

        // Rename and format first words before the colon in bullet points for Executive Summary
        const NORM_EXEC_TITLE_MAP: Record<string, string> = {
          "valueproposition": "Company Overview",
          "companyoverview": "Company Overview",
          "productoffering": "Product Overview",
          "productoverview": "Product Overview",
          "businessmodel": "Business Model",
          "customerprofile": "Customer Overview",
          "customeroverview": "Customer Overview",
          "customerfeedback": "Customer Feedback & Testimonials",
          "customerfeedbacktestimonials": "Customer Feedback & Testimonials",
          "customerfeedbackandtestimonials": "Customer Feedback & Testimonials",
          "competitivelandscape": "Competitive Landscape",
          "leadership": "Leadership Team",
          "leadershipteam": "Leadership Team",
          "salesgtm": "Sales & Go-To-Market",
          "salesandgtm": "Sales & Go-To-Market",
          "salesgotomarket": "Sales & Go-To-Market",
          "salesandgotomarket": "Sales & Go-To-Market",
          "rd": "Research & Development",
          "randd": "Research & Development",
          "researchdevelopment": "Research & Development",
          "researchanddevelopment": "Research & Development",
          "market": "Market Definition",
          "marketdefinition": "Market Definition"
        };

        const STANDARD_EXEC_TITLES = [
          "Company Overview",
          "Product Overview",
          "Business Model",
          "Customer Overview",
          "Customer Feedback & Testimonials",
          "Competitive Landscape",
          "Leadership Team",
          "Sales & Go-To-Market",
          "Research & Development",
          "Market Definition"
        ];

        const normalizeKey = (str: string) => {
          return str
            .toLowerCase()
            .replace(/\b(and|&)\b/g, 'and')
            .replace(/[^a-z0-9]/g, '')
            .trim();
        };

        const getValueHtml = ($: cheerio.CheerioAPI, $el: cheerio.Cheerio): string => {
          const contents = $el.contents();
          let valueHtml = '';
          let foundColon = false;
          
          contents.each((_, node) => {
            if (foundColon) {
              valueHtml += $.html(node);
              return;
            }
            
            const text = $(node).text();
            const colonIdx = text.indexOf(':');
            if (colonIdx !== -1) {
              foundColon = true;
              if (node.nodeType === 3) {
                valueHtml += text.substring(colonIdx + 1);
              } else {
                const afterText = text.substring(colonIdx + 1).trim();
                if (afterText.length > 0) {
                  const innerValueHtml = getValueHtml($, $(node));
                  const tag = (node as any).tagName;
                  const attribs = $(node).attr();
                  let attribsStr = '';
                  if (attribs) {
                    attribsStr = Object.entries(attribs)
                      .map(([key, val]) => ` ${key}="${val}"`)
                      .join('');
                  }
                  valueHtml += `<${tag}${attribsStr}>${innerValueHtml}</${tag}>`;
                }
              }
            }
          });
          return valueHtml;
        };

        // Preprocess any paragraphs in Executive Summary starting with a bullet point character into list items
        let currentUl: any = null;
        $es('p, div').each((_, el) => {
          const $el = $es(el);
          const text = $el.text().trim();
          
          if (/^[•●▪◦\-\u2022]/.test(text)) {
            const colonIdx = text.indexOf(':');
            let canonicalTitle = '';
            let valueHtml = '';
            
            if (colonIdx > 0 && colonIdx < 60) {
              const beforeText = text.substring(0, colonIdx).replace(/^[•●▪◦\-\u2022]\s*/, '').trim();
              const normKey = normalizeKey(beforeText);
              if (NORM_EXEC_TITLE_MAP[normKey]) {
                canonicalTitle = NORM_EXEC_TITLE_MAP[normKey];
              } else {
                canonicalTitle = beforeText;
              }
              valueHtml = getValueHtml($es, $el);
            } else {
              let rawHtml = $el.html() || '';
              valueHtml = rawHtml.replace(/^(?:<[^>]+>)*\s*[•●▪◦\-\u2022]\s*/, '').trim();
            }
            
            const liHtml = canonicalTitle 
              ? `<li style="margin-bottom: 0.5em; line-height: 1.5; color: #334155;"><strong>${canonicalTitle}:</strong> ${valueHtml.trim()}</li>`
              : `<li style="margin-bottom: 0.5em; line-height: 1.5; color: #334155;">${valueHtml.trim()}</li>`;
            
            const $li = $es(liHtml);
            if (!currentUl) {
              currentUl = $es('<ul style="padding-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5em;"></ul>');
              $el.before(currentUl);
            }
            currentUl.append($li);
            $el.remove();
          } else {
            currentUl = null;
          }
        });

        // Run the mapping on all standard and newly generated <li> elements to parse and uniformize headers
        const parsedLis: {
          $li: cheerio.Cheerio;
          hasTitle: boolean;
          title: string;
          contentHtml: string;
        }[] = [];

        $es('li').each((_, liEl) => {
          const $li = $es(liEl);
          const text = $li.text().trim();
          const html = $li.html() || '';
          const colonIdx = text.indexOf(':');

          let hasTitle = false;
          let title = '';
          let contentHtml = '';

          if (colonIdx > 0 && colonIdx < 60) {
            const beforeText = text.substring(0, colonIdx).trim();
            const normKey = normalizeKey(beforeText);
            
            if (NORM_EXEC_TITLE_MAP[normKey]) {
              hasTitle = true;
              title = NORM_EXEC_TITLE_MAP[normKey];
              contentHtml = getValueHtml($es, $li).trim();
            } else {
              const canonical = STANDARD_EXEC_TITLES.find(t => normalizeKey(t) === normKey);
              if (canonical) {
                hasTitle = true;
                title = canonical;
                contentHtml = getValueHtml($es, $li).trim();
              } else {
                hasTitle = false;
                contentHtml = html.trim();
              }
            }
          } else {
            hasTitle = false;
            contentHtml = html.trim();
          }

          contentHtml = contentHtml.replace(/^[•●▪◦\-\u2022\s\t:]+/, '').trim();

          parsedLis.push({
            $li,
            hasTitle,
            title,
            contentHtml
          });
        });

        const usedTitles = new Set<string>();
        parsedLis.forEach(item => {
          if (item.hasTitle) {
            usedTitles.add(item.title);
          }
        });

        let titleIndex = 0;
        parsedLis.forEach(item => {
          if (!item.hasTitle) {
            while (titleIndex < STANDARD_EXEC_TITLES.length && usedTitles.has(STANDARD_EXEC_TITLES[titleIndex])) {
              titleIndex++;
            }
            if (titleIndex < STANDARD_EXEC_TITLES.length) {
              item.title = STANDARD_EXEC_TITLES[titleIndex];
              item.hasTitle = true;
              usedTitles.add(item.title);
              titleIndex++;
            }
          }
        });

        parsedLis.forEach(item => {
          if (item.hasTitle) {
            item.$li.html(`<strong>${item.title}:</strong> ${item.contentHtml}`);
          } else {
            item.$li.html(item.contentHtml);
          }
        });

        // Merge consecutive <ul> tags again in case we created new ones
        $es('ul + ul').each((_, ulEl) => {
          const $ul = $es(ulEl);
          const $prev = $ul.prev('ul');
          if ($prev.length > 0) {
            $prev.append($ul.contents());
            $ul.remove();
          }
        });

        bodyHtml = $es.html();
      }

      // SPECIAL CRITERIA: For Competitive Landscape (index 5), transform all H2 sub-headers into bullet points
      if (index === 5) {
        const $cl = cheerio.load(bodyHtml, null, false);
        $cl('h2').each((_, h2El) => {
          const $h2 = $cl(h2El);
          const h2Text = $h2.text().trim().replace(/:$/, '');
          
          // Only transform if it is NOT a "Source" header
          const isSourceHeader = h2Text.toLowerCase().includes('source');
          if (isSourceHeader || !h2Text) return;

          let combinedBody = '';
          let $next = $h2.next();
          while ($next.length > 0 && !['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes($next[0].tagName)) {
            combinedBody += (combinedBody ? ' ' : '') + $next.text().trim();
            const $toRemove = $next;
            $next = $next.next();
            $toRemove.remove();
          }
          
          const listItemHtml = `<ul style="padding-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5em;">
            <li style="margin-bottom: 0.5em; line-height: 1.5; color: #334155;"><strong>${h2Text}:</strong> ${combinedBody}</li>
          </ul>`;
          $h2.replaceWith(listItemHtml);
        });

        // Merge consecutive <ul> tags for a cleaner look
        $cl('ul + ul').each((_, ulEl) => {
          const $ul = $cl(ulEl);
          const $prev = $ul.prev('ul');
          if ($prev.length > 0) {
            $prev.append($ul.contents());
            $ul.remove();
          }
        });
        bodyHtml = $cl.html();
      }

      // POST-PROCESS: Group Competition entries into a single bulleted list (Same logic as paste)
      // Already handled by the initial cheerio load and transformations above if applicable,
      // but let's ensure sources are consolidated per section.

      const $body = cheerio.load(bodyHtml, null, false);

      // --- CONSOLIDATED SOURCE EXTRACTION (Section Specific) ---
      let sectionSources: LinkData[] = [];

      const getLinksFromElement = ($el: any): LinkData[] => {
        const links: LinkData[] = [];
        let lastIndex = 0;
        const parentText = $el.text();

        $el.find('a').each((_: number, aEl: any) => {
          const href = $body(aEl).attr('href');
          let linkText = $body(aEl).text().trim();
          if (href) {
            // Check if the link text is just a naked URL
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
            
            // Clean up the linkText (strip leading/trailing bullets, etc.)
            let cleanPublisher = cleanPublisherText(linkText);
            
            // Fallback to hostname or extractLinks if it's still a naked URL, generic 'source', or too long (e.g. parsed a whole sentence)
            const isStillNaked = /^(?:https?:\/\/|www\.)[^\s]+$/i.test(cleanPublisher) || 
                                 /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?$/i.test(cleanPublisher) ||
                                 !cleanPublisher ||
                                 cleanPublisher.toLowerCase() === 'source' ||
                                 cleanPublisher.length > 60;
            
            if (isStillNaked) {
              const extracted = extractLinks(parentText);
              const matched = extracted.find(l => l.url === href || l.url.replace(/^https?:\/\//i, '') === href.replace(/^https?:\/\//i, ''));
              if (matched && matched.publisher && matched.publisher.toLowerCase() !== 'source') {
                cleanPublisher = matched.publisher;
              } else {
                try {
                  const urlObj = new URL(href.startsWith('http') ? href : 'https://' + href);
                  cleanPublisher = urlObj.hostname.replace(/^www\./, '');
                  cleanPublisher = cleanPublisher.charAt(0).toUpperCase() + cleanPublisher.slice(1);
                } catch (e) {
                  cleanPublisher = 'Source';
                }
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

      // 1. Walk backward from the last element to find pure source blocks at the very end of the section
      let $last = $body.root().children().last();
      while ($last.length > 0) {
        const title = $last.text().trim().toLowerCase();
        const isSourcesHeader = title === 'sources' || title === 'source' || title === 'sources:' || title === 'source:';
        if (isSourcesHeader) {
          const $prev = $last.prev();
          $last.remove();
          $last = $prev;
          continue;
        }

        const links = getLinksFromElement($last);
        if (links.length > 0 && isPureSourceBlock($last.text().trim(), links)) {
          sectionSources.push(...links);
          const $prev = $last.prev();
          $last.remove();
          $last = $prev;
        } else {
          break;
        }
      }

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

      // BOLD WORDS BEFORE COLON IN BULLET POINTS
      $body('li').each((_, liEl) => {
        const $li = $body(liEl);
        // Skip if it already contains strong at the beginning or is a source link
        if ($li.find('strong, b').length > 0 || $li.find('a').length > 0) return;
        
        const html = $li.html() || '';
        const colonIndex = html.indexOf(':');
        
        // Only bold if colon is within the first 60 characters to avoid bolding entire sentences 
        // that happen to have a colon late in the text.
        if (colonIndex > 0 && colonIndex < 60) {
          const before = html.substring(0, colonIndex);
          const after = html.substring(colonIndex);
          $li.html(`<strong>${before}:</strong>${after.substring(1)}`);
        }
      });

      $body('h1, h2, h3, h4, h5, h6').each((_, el) => {
        // Remove <strong> and <b> wrappers inside the header
        $body(el).find('strong, b').each((_, boldEl) => {
          $body(boldEl).replaceWith($body(boldEl).html() || '');
        });

        // Apply strict inline unbolding and un-italicizing styles for the clipboard
        const isMainTitle = !$body(el).attr('data-subheader');
        const fontSize = isMainTitle ? '1.5em' : '1.25em';
        const marginTop = isMainTitle ? '2em' : '1.5em';
        
        $body(el).attr('style', `font-weight: 300; color: #1e293b; margin-top: ${marginTop}; margin-bottom: 0.5em; font-size: ${fontSize};`);

        // Remove <em> and <i> tags inside headers too
        $body(el).find('em, i').each((_, italicEl) => {
          $body(italicEl).replaceWith($body(italicEl).html() || '');
        });

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
  } catch (error: any) {
    console.error('Extraction error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to process document',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }), { status: 500 });
  }
};
