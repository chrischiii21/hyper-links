/**
 * Robust link extraction and hyperlinking utilities
 * Based on the logic from RichTextCopier.tsx
 */

export interface LinkData {
  publisher: string;
  url: string;
  year?: string;
}

/**
 * Extracts links from text and identifies publishers
 */
export function extractLinks(text: string): LinkData[] {
  const results: LinkData[] = [];
  
  // Clean up standard headers (e.g. Sources, Use Cases, References) at the very beginning, including markdown markers
  let cleanText = text.replace(/^(?:#+\s*)?(?:Sources?|Use\s+Cases?|References?)[:\s\n]*/i, '').trim();
  
  // Strip HTML tags to avoid matching URLs with trailing </strong> etc.
  cleanText = cleanText.replace(/<[^>]*>/g, ' ');
  
  // Find all URLs in the text
  // We prioritize http(s) and www to avoid matching naked domains that are actually part of the publisher name (e.g. Coinzilla.com)
  const urlRegex = /((?:https?:\/\/|www\.)[^\s\)\*>]+|(?:(?:\s|^)[a-zA-Z0-9-]+\.(?:com|org|net|io|ai|gov|edu|co|biz|info|me|us|so)\b(?:\/[^\s\)\*>]*[^\s\)\*>\.,])?))/gi;
  let match;
  let lastIndex = 0;
  
  while ((match = urlRegex.exec(cleanText)) !== null) {
    const url = match[1]?.trim();
    if (!url) continue;

    const matchIndex = match.index;
    
    // Text between the last URL (or start) and this URL
    let beforeUrl = cleanText.substring(lastIndex, matchIndex).trim();
    if (beforeUrl.includes('\n')) {
      const lines = beforeUrl.split('\n');
      beforeUrl = lines[lines.length - 1].trim();
    }
    
    // Clean up the "publisher" text, including bullets (\u2022 and other unicode variations)
    let publisher = beforeUrl
      .replace(/^[,\-\(\)\s\t\n;:*\u2013\u2014\u2022\u00b7\u2219\u25cf\u2043\u2023]+/, '') 
      .replace(/[,\-\(\)\s\t\n;:*\u2013\u2014\u2022\u00b7\u2219\u25cf\u2043\u2023]+$/, '') 
      .trim();

    let year = '';

    // Handle the case where there are parentheses before the URL (Source: Publisher, 2026, URL)
    const parenMatch = publisher.match(/(.*?)\s*\((.*?)$/);
    
    if (parenMatch) {
       const outside = parenMatch[1].trim();
       let inside = parenMatch[2].replace(/\)$/, '').trim();
       
       if (inside) {
           inside = inside.replace(/Source:\s*/i, '').trim();
           const parts = inside.split(',').map(p => p.trim());
           const firstInside = parts[0];
           
           // Identify year in parts
           parts.forEach(part => {
             if (/^\d{4}$/.test(part)) year = part;
           });

           // Identification logic for dates/years
           const isMonthOnly = /^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Aug|Sept|Oct|Nov|Dec)(\s+\d{1,2})?$/i.test(firstInside);
           const isYearOrDate = /^\d{4}$/.test(firstInside) || 
                                /^(Q[1-4]\s+)?\d{4}$/i.test(firstInside) || 
                                /^[a-zA-Z]+\s+\d{1,2},?\s*\d{4}$/.test(firstInside) || 
                                /^[a-zA-Z]+\s+\d{4}$/.test(firstInside) || 
                                isMonthOnly;
           
           if (isYearOrDate && outside) {
               publisher = outside;
           } else {
               publisher = firstInside;
           }
       } else if (outside) {
           publisher = outside;
       }
    } else {
       // Fallback for non-parenthesized sources: Publisher, 2026, URL
       const parts = publisher.split(',').map(p => p.trim());
       if (parts.length > 1) {
         publisher = parts[0].replace(/Source:\s*/i, '').trim();
         parts.forEach(part => {
           if (/^\d{4}$/.test(part)) year = part;
         });
       } else {
         publisher = publisher.replace(/Source:\s*/i, '').trim();
       }
    }
    
    // Ensure URL has a protocol
    let finalUrl = url;
    if (!url.toLowerCase().startsWith('http') && !url.toLowerCase().startsWith('www.')) {
        finalUrl = 'https://' + url;
    } else if (url.toLowerCase().startsWith('www.')) {
        finalUrl = 'https://' + url;
    }

    if (!publisher || publisher.length < 2 || publisher.toLowerCase() === 'source') {
        try {
          const urlObj = new URL(finalUrl);
          publisher = urlObj.hostname.replace(/^www\./, '');
          // Capitalize first letter
          publisher = publisher.charAt(0).toUpperCase() + publisher.slice(1);
        } catch (e) {
          publisher = 'Source';
        }
    }
    
    // SPECIAL CASE: If the "URL" we found is actually a naked domain that was immediately followed by a comma, 
    // it was likely the publisher name. We skip it if there's a better URL coming up.
    const remainingText = cleanText.substring(urlRegex.lastIndex);
    const isNakedDomain = !url.toLowerCase().startsWith('http') && !url.toLowerCase().startsWith('www.');
    if (isNakedDomain && remainingText.trim().startsWith(',')) {
      // Look ahead for a real URL in the same citation block
      const nextCitationEnd = remainingText.indexOf(')');
      const nextFullUrl = remainingText.substring(0, nextCitationEnd > 0 ? nextCitationEnd : 50).match(/https?:\/\/[^\s\)]+/);
      if (nextFullUrl) {
        // Skip this naked domain match, it's just the publisher name
        continue;
      }
    }

    results.push({ publisher, url: finalUrl, year });
    lastIndex = urlRegex.lastIndex;
  }
  
  return results;
}

/**
 * Converts a string with raw links into a formatted HTML list of hyperlinked sources
 */
export function generateSourceListHtml(text: string): string {
  const links = extractLinks(text);
  if (links.length === 0) return text;

  let html = `<ul style="padding-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5em;">`;
  links.forEach(link => {
    html += `<li style="margin-bottom: 0.25em;"><a href="${link.url}" style="color: #2563eb; text-decoration: none;">${link.publisher}</a></li>`;
  });
  html += '</ul>';
  return html;
}
