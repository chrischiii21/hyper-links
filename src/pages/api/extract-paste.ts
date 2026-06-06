import type { APIRoute } from 'astro';
import { marked } from 'marked';
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

const SUB_HEADERS = [
  "Company Overview",
  "Product Overview",
  "Product Offering",
  "Use Cases",
  "Use Case",
  "Business Model",
  "Pricing Structure",
  "Prices",
  "Contract Length",
  "Additional Important Note",
  "Additional Note",
  "Company Foundation",
  "Founding Details & Initial Focus",
  "Company Evolution",
  "Strategic Milestones",
  "Customer Geography",
  "Customer Size",
  "Customer Industry",
  "Customer Overview",
  "Buying Personas",
  "Adoption Trigger & Pain Points",
  "Key Purchasing Criteria",
  "Key Purchasing Criterion",
  "Customer Feedback",
  "Customer Feedback & Testimonials",
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
        let processedMarkdown = rawMarkdown;
        processedMarkdown = processedMarkdown
          .split('\n')
          .map(line => {
            const trimmed = line.trim();
            if (/^[•●▪◦]\s*/.test(trimmed)) {
              return '- ' + trimmed.replace(/^[•●▪◦]\s*/, '');
            }
            return line;
          })
          .join('\n');

        const rawHtml = await marked.parse(processedMarkdown);
        const $ = cheerio.load(rawHtml, null, false);

        // PRE-PROCESS: Remove empty paragraphs or those containing only &nbsp; or <br>
        $('p, div, span').each((_, el) => {
          const $el = $(el);
          const text = $el.text().trim();
          const html = $el.html() || '';
          if (!text && (html === '' || html === '&nbsp;' || html === '<br>' || html === '<br/>')) {
            $el.remove();
          }
        });

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
        const prefixPattern = `(?:[o\\s\\u2013\\u2014\\u2022-]*)(?:(?:[A-Za-z0-9]+[.:\\s\\u2013\\u2014)-]+)*)?`;
        const subHeaderRegex = new RegExp(`^${prefixPattern}(${escapedSubHeaders})\\s*[:\\-\\u2013\\u2014]?\\s*(.*)$`, 'is');
        const titleRegexHtml = new RegExp(`^(?:<[^>]+>|\\s)*${prefixPattern}(${escapedSubHeaders})(?:<[^>]+>|\\s)*[:\\-\\u2013\\u2014]?(?:<[^>]+>|\\s)*`, 'i');

        if (index !== 0) {
          $('p, li, h1, h2, h3, h4, h5, h6, span, strong, b, em, i').each((_, el) => {
            const text = $(el).text().trim();
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
              let $block = $(el);
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


                  let finalHtml = remainingText.trim();
                  const rawHtml = $(el).html() || '';
                  const htmlMatch = titleRegexHtml.exec(rawHtml);
                  if (htmlMatch) {
                    finalHtml = rawHtml.substring(htmlMatch[0].length).trim();
                  }
                  
                  // Clean up leading punctuation and spaces (e.g. leading periods, colons, dashes, bullets)
                  finalHtml = finalHtml.replace(/^[.\s,;:\-\u2013\u2014\u2022]+/, '').trim();
                  
                  if (finalHtml.length > 0) {
                    // For sections other than Executive Summary, separate inline headers to new line
                    const newTag = 'p';
                    $(el).replaceWith(`${h2Html}\n<${newTag}>${finalHtml}</${newTag}>`);
                  } else {
                    $(el).replaceWith(h2Html);
                  }
                } else {
                  $(el).replaceWith(h2Html);
                }
              } else {
                $(el).replaceWith(h2Html);
              }
            }
          });
        }

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
        // and append a consolidated list at the end of the section.
        let sectionSources: LinkData[] = [];

        const getLinksFromElement = ($el: any): LinkData[] => {
          const links: LinkData[] = [];
          let lastIndex = 0;
          const parentText = $el.text();

          $el.find('a').each((_: number, aEl: any) => {
            const href = $(aEl).attr('href');
            let linkText = $(aEl).text().trim();
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
                lastIndex = anchorIndex + $(aEl).text().trim().length;
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
        
        // 1. Identify and remove scattered sources
        if (index !== 0) {
          $('p, li, div').each((_, el) => {
            const $el = $(el);
            const text = $el.text().trim();
            const links = getLinksFromElement($el);
            
            if (links.length > 0) {
              sectionSources.push(...links);
              if (isPureSourceBlock(text, links)) {
                $el.remove();
              }
            }
          });
        }

        // 2. Identify and remove existing "Sources" headers and their consecutive content
        $('h1, h2, h3, h4, h5, h6, p, li, strong, em, b').each((_, h2El) => {
          const $h2 = $(h2El);
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

        // 3. Deduplicate sources and enhance duplicate publishers
        sectionSources = deduplicateAndEnhancePublishers(sectionSources);

        // 4. Append consolidated sources at the end
        if (sectionSources.length > 0) {
          const label = sectionSources.length === 1 ? 'Source' : 'Sources';
          const sourcesH2 = `<h2 data-subheader="true" style="font-weight: 300; color: #1e293b; margin-top: 1.5em; margin-bottom: 0.5em; font-size: 1.25em;"><span style="font-weight: 300;">${label}</span></h2>`;
          
          let listHtml = `<ul style="padding-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5em;">`;
          sectionSources.forEach(link => {
            listHtml += `<li style="margin-bottom: 0.25em;"><a href="${link.url}" style="color: #2563eb; text-decoration: none;">${link.publisher}</a></li>`;
          });
          listHtml += '</ul>';
          
          $.root().append(sourcesH2);
          $.root().append(listHtml);
        }

        // Link extraction utility moved to src/lib/linkUtils.ts

        let bodyHtml = $.html();
        if (index === 0) {
          bodyHtml = bodyHtml.replace(/%%COMPANY_OVERVIEW_PLACEHOLDER%%/g, 'Company Overview');
        } else {
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
            const colonIdx = text.indexOf(':');
            
            if (/^[•●▪◦\-\u2022]/.test(text) && colonIdx > 0 && colonIdx < 60) {
              const beforeText = text.substring(0, colonIdx).replace(/^[•●▪◦\-\u2022]\s*/, '').trim();
              const normKey = normalizeKey(beforeText);
              
              let canonicalTitle = beforeText;
              if (NORM_EXEC_TITLE_MAP[normKey]) {
                canonicalTitle = NORM_EXEC_TITLE_MAP[normKey];
              }
              
              const valueHtml = getValueHtml($es, $el);
              const liHtml = `<li style="margin-bottom: 0.5em; line-height: 1.5; color: #334155;"><strong>${canonicalTitle}:</strong> ${valueHtml.trim()}</li>`;
              const $li = $es(liHtml);
              
              if (!currentUl) {
                currentUl = $es('<ul style="padding-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5em;"></ul>');
                $el.before(currentUl);
              }
              currentUl.append($li);
              $el.remove();
            } else {
              // It's not a bullet point, break the current <ul> grouping
              currentUl = null;
            }
          });

          // Run the mapping on all standard and newly generated <li> elements
          $es('li').each((_, liEl) => {
            const $li = $es(liEl);
            const text = $li.text().trim();
            const colonIndex = text.indexOf(':');
            
            if (colonIndex > 0 && colonIndex < 60) {
              const beforeText = text.substring(0, colonIndex).trim();
              const normKey = normalizeKey(beforeText);
              
              if (NORM_EXEC_TITLE_MAP[normKey]) {
                const canonicalTitle = NORM_EXEC_TITLE_MAP[normKey];
                const valueHtml = getValueHtml($es, $li);
                $li.html(`<strong>${canonicalTitle}:</strong> ${valueHtml.trim()}`);
              }
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

          // Merge consecutive <ul> tags
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

        const $final = cheerio.load(bodyHtml, null, false);

        // BOLD WORDS BEFORE COLON IN BULLET POINTS
        $final('li').each((_, liEl) => {
          const $li = $final(liEl);
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

        $final('h1, h2, h3, h4, h5, h6').each((_, el) => {
          // Remove <strong> and <b> wrappers inside the header
          $final(el).find('strong, b').each((_, boldEl) => {
            $final(boldEl).replaceWith($final(boldEl).html() || '');
          });

          // Apply strict inline unbolding and un-italicizing styles
          const isMainTitle = !$final(el).attr('data-subheader');
          const fontSize = isMainTitle ? '1.5em' : '1.25em';
          const marginTop = isMainTitle ? '2em' : '1.5em';
          
          $final(el).attr('style', `font-weight: 300; color: #1e293b; margin-top: ${marginTop}; margin-bottom: 0.5em; font-size: ${fontSize};`);

          // Remove <em> and <i> tags inside headers too
          $final(el).find('em, i').each((_, italicEl) => {
            $final(italicEl).replaceWith($final(italicEl).html() || '');
          });

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
