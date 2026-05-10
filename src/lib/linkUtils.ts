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
  
  // Clean up "Sources" header at the very beginning
  let cleanText = text.replace(/^Sources?[:\s\n]*/i, '').trim();
  
  // Strip HTML tags to avoid matching URLs with trailing </strong> etc.
  cleanText = cleanText.replace(/<[^>]*>/g, ' ');
  
  // Find all URLs in the text
  // Find all URLs in the text - supporting http(s)://, www., and common .com/.org etc. domains
  // We exclude trailing punctuation to handle (Source: ... http://link.com) correctly
  const urlRegex = /((?:https?:\/\/|www\.)[^\s\)\*>]+|(?:[a-zA-Z0-9-]+\.(?:com|org|net|io|ai|gov|edu|co|biz|info|me|us)\b(?:\/[^\s\)\*>]*[^\s\)\*>\.,])?))/gi;
  let match;
  let lastIndex = 0;
  
  while ((match = urlRegex.exec(cleanText)) !== null) {
    const url = match[1];
    const matchIndex = match.index;
    
    // Text between the last URL (or start) and this URL
    let beforeUrl = cleanText.substring(lastIndex, matchIndex).trim();
    
    // Clean up the "publisher" text
    let publisher = beforeUrl
      .replace(/^[,\-\(\)\s\t\n;:*\u2013\u2014]+/, '') // Leading junk (added : * em-dash en-dash)
      .replace(/[,\-\(\)\s\t\n;:*\u2013\u2014]+$/, '') // Trailing junk
      .trim();

    // Handle the case where there are parentheses before the URL
    const parenMatch = publisher.match(/(.*?)\s*\((.*?)$/);
    
    if (parenMatch) {
       const outside = parenMatch[1].trim();
       let inside = parenMatch[2].replace(/\)$/, '').trim();
       
       if (inside) {
           inside = inside.replace(/Source:\s*/i, '').trim();
           const firstInside = inside.split(',')[0].trim();
           
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
       publisher = publisher.split(',')[0].replace(/Source:\s*/i, '').trim();
    }
    
    if (!publisher || publisher.length < 2) {
        publisher = 'Source';
    }
    
    // Ensure URL has a protocol
    let finalUrl = url;
    if (!url.toLowerCase().startsWith('http')) {
        finalUrl = 'https://' + url;
    }
    
    results.push({ publisher, url: finalUrl });
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

  let html = `<ul style="list-style-type: disc; padding-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5em;">`;
  links.forEach(link => {
    html += `<li style="margin-bottom: 0.25em;"><a href="${link.url}" style="color: #2563eb; text-decoration: none;">${link.publisher}</a></li>`;
  });
  html += '</ul>';
  return html;
}
