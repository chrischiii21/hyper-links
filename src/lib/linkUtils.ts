/**
 * Robust link extraction and hyperlinking utilities
 * Based on the logic from RichTextCopier.tsx
 */

export interface LinkData {
  publisher: string;
  url: string;
  year?: string;
}

export function appendUrlTitleToPublisher(publisher: string, urlStr: string): string {
  if (!urlStr) return publisher;
  try {
    const url = new URL(urlStr.startsWith('http') ? urlStr : 'https://' + urlStr);
    let pathname = url.pathname;
    
    // Remove trailing slash and common file extensions
    pathname = pathname.replace(/\/$/, '').replace(/\.[a-zA-Z0-9]+$/, '');
    
    if (!pathname || pathname === '/') return publisher;
    
    // Get segments
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) return publisher;
    
    // Get the last segment
    let lastSegment = segments[segments.length - 1];
    
    // If last segment is empty or just numbers/IDs, try the second to last if available
    if (/^\d+$/.test(lastSegment) && segments.length > 1) {
      lastSegment = segments[segments.length - 2];
    }
    
    // Replace hyphens, underscores, %20 etc with spaces
    let decoded = lastSegment;
    try {
      decoded = decodeURIComponent(lastSegment);
    } catch (e) {}
    
    let wordsStr = decoded.replace(/[-_]+/g, ' ').trim();
    if (!wordsStr) return publisher;
    
    // Capitalize words
    const words = wordsStr.split(' ');
    const capitalized = words.map((word, idx) => {
      if (!word) return '';
      const lower = word.toLowerCase();
      
      // Minor words that shouldn't be capitalized in titles unless it's the first word
      const shortWords = ['to', 'on', 'in', 'of', 'and', 'the', 'a', 'an', 'for', 'with', 'at', 'by', 'from', 'as'];
      if (shortWords.includes(lower) && idx > 0) {
        return lower;
      }
      
      // Specific capitalization for common abbreviations
      if (lower === 'ai') return 'AI';
      if (lower === 'us') return 'Us';
      if (/^q[1-4]$/i.test(lower)) return lower.toUpperCase();
      
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
    
    // Always capitalize the first word
    if (capitalized.length > 0 && capitalized[0]) {
      capitalized[0] = capitalized[0].charAt(0).toUpperCase() + capitalized[0].slice(1);
    }
    
    const urlTitle = capitalized.join(' ');
    
    // Ensure we don't duplicate the publisher name if urlTitle already starts with it
    const escapedPub = publisher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pubRegex = new RegExp(`^${escapedPub}\\b\\s*[-–—:]*\\s*`, 'i');
    
    if (pubRegex.test(urlTitle)) {
      const strippedTitle = urlTitle.replace(pubRegex, '').trim();
      if (strippedTitle) {
        return `${publisher} - ${strippedTitle}`;
      }
      return publisher;
    }
    
    // Check if the publisher starts with the urlTitle (e.g. publisher is "Blend360" and urlTitle is "Blend")
    const pubPrefixRegex = new RegExp(`^${urlTitle}\\b`, 'i');
    if (pubPrefixRegex.test(publisher)) {
      return publisher;
    }
    
    return `${publisher} - ${urlTitle}`;
  } catch (e) {
    return publisher;
  }
}

export function deduplicateAndEnhancePublishers(links: LinkData[]): LinkData[] {
  // Deduplicate by URL first
  const seenUrls = new Set<string>();
  const uniqueLinks = links.filter(link => {
    if (seenUrls.has(link.url)) return false;
    seenUrls.add(link.url);
    return true;
  });

  // Count occurrences of each publisher (case-insensitive)
  const publisherCounts = new Map<string, number>();
  uniqueLinks.forEach(link => {
    const pubLower = link.publisher.toLowerCase();
    publisherCounts.set(pubLower, (publisherCounts.get(pubLower) || 0) + 1);
  });

  // Enhance publisher names if they are duplicated
  return uniqueLinks.map(link => {
    const pubLower = link.publisher.toLowerCase();
    const count = publisherCounts.get(pubLower) || 0;
    
    if (count > 1) {
      const enhancedPublisher = appendUrlTitleToPublisher(link.publisher, link.url);
      return {
        ...link,
        publisher: enhancedPublisher
      };
    }
    
    return link;
  });
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
  // We allow non-alphanumeric characters (like parenthesises) to precede naked domains.
  const urlRegex = /(?:^|[^a-zA-Z0-9])((?:https?:\/\/|www\.)[^\s\)\*>]+|[a-zA-Z0-9-]+\.(?:com|org|net|io|ai|gov|edu|co|biz|info|me|us|so)\b(?:\/[^\s\)\*>]*[^\s\)\*>\.,])?)/gi;
  let match;
  let lastIndex = 0;
  
  while ((match = urlRegex.exec(cleanText)) !== null) {
    const url = match[1]?.trim();
    if (!url) continue;

    // Calculate exact start index of the URL (ignoring the prefix character)
    const matchIndex = match.index + match[0].indexOf(match[1]);
    
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

    // Custom brand/description extraction from the parsed "publisher" text
    let finalPublisher = publisher;
    
    // 1. Extract brand name from URL
    let brand = '';
    try {
      const urlObj = new URL(finalUrl);
      const hostname = urlObj.hostname.replace(/^www\./i, '');
      const domainParts = hostname.split('.');
      if (domainParts.length >= 2) {
        const secondToLast = domainParts[domainParts.length - 2].toLowerCase();
        const isCommonTld = ['co', 'com', 'org', 'net', 'gov', 'edu', 'ltd'].includes(secondToLast);
        if (isCommonTld && domainParts.length >= 3) {
          brand = domainParts[domainParts.length - 3];
        } else {
          brand = domainParts[domainParts.length - 2];
        }
      } else {
        brand = domainParts[0] || '';
      }
    } catch (e) {}

    // Capitalize brand name properly
    let capitalizedBrand = '';
    if (brand) {
      if (brand.toLowerCase() === 'blend360') {
        capitalizedBrand = 'Blend360';
      } else if (brand.toLowerCase() === 'jalios') {
        capitalizedBrand = 'Jalios';
      } else {
        capitalizedBrand = brand.charAt(0).toUpperCase() + brand.slice(1);
      }
    }

    // 2. See if the publisher text contains the brand, or is a description
    if (capitalizedBrand && publisher && publisher.toLowerCase() !== 'source') {
      const pubLower = publisher.toLowerCase();
      const brandLower = capitalizedBrand.toLowerCase();
      
      let description = '';
      if (pubLower.startsWith(brandLower)) {
        // e.g. "Jalios clients page" -> "clients page"
        description = publisher.substring(capitalizedBrand.length).trim();
      } else if (pubLower.endsWith(brandLower)) {
        // e.g. "clients page Jalios" -> "clients page"
        description = publisher.substring(0, publisher.length - capitalizedBrand.length).trim();
      } else {
        // E.g. "clients page" -> description is "clients page", brand is "Jalios"
        const isGenericDesc = /^(clients|homepage|sectors|solutions|website|about|features|pricing|blog|news|documentation|docs)/i.test(pubLower);
        if (isGenericDesc) {
          description = publisher;
        }
      }

      // Clean up description prefix/suffix punctuation
      description = description
        .replace(/^[,\-\(\)\s\t\n;:*\u2013\u2014\u2022\u00b7\u2219\u25cf\u2043\u2023]+/, '') 
        .replace(/[,\-\(\)\s\t\n;:*\u2013\u2014\u2022\u00b7\u2219\u25cf\u2043\u2023]+$/, '') 
        .trim();

      if (description) {
        // Standardize common descriptions
        let cleanDesc = description;
        if (/^homepage$/i.test(cleanDesc)) {
          cleanDesc = 'Homepage';
        } else if (/^clients\s*page$/i.test(cleanDesc) || /^clients$/i.test(cleanDesc)) {
          cleanDesc = 'Clients';
        } else if (/^sectors\s*pages?$/i.test(cleanDesc) || /^sectors$/i.test(cleanDesc) || /^solutions\/secteurs$/i.test(cleanDesc) || /^secteurs$/i.test(cleanDesc)) {
          cleanDesc = 'Sectors';
        } else {
          // Capitalize description words
          cleanDesc = cleanDesc.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        }
        finalPublisher = `${capitalizedBrand} - ${cleanDesc}`;
      } else {
        finalPublisher = capitalizedBrand;
      }
    } else if (capitalizedBrand) {
      finalPublisher = capitalizedBrand;
    }

    // 3. Fallback/Specific Mappings: If the publisher ended up being just the brand name (or fallback), 
    // try to get a more specific page title from the URL path.
    if (finalPublisher === capitalizedBrand && capitalizedBrand) {
      try {
        const urlObj = new URL(finalUrl);
        const pathname = urlObj.pathname.replace(/\/$/, '').toLowerCase();
        
        if (urlObj.hostname.replace(/^www\./i, '') === 'jalios.com') {
          if (pathname === '/fr' || pathname === '/fr/' || pathname === '') {
            finalPublisher = 'Jalios - Homepage';
          } else if (pathname === '/fr/clients') {
            finalPublisher = 'Jalios - Clients';
          } else if (pathname === '/fr/solutions/secteurs') {
            finalPublisher = 'Jalios - Sectors';
          } else {
            finalPublisher = appendUrlTitleToPublisher(capitalizedBrand, finalUrl);
          }
        } else {
          finalPublisher = appendUrlTitleToPublisher(capitalizedBrand, finalUrl);
        }
      } catch (e) {
        // Keep finalPublisher as capitalizedBrand
      }
    }

    if (!finalPublisher || finalPublisher.length < 2 || finalPublisher.toLowerCase() === 'source') {
        try {
          const urlObj = new URL(finalUrl);
          let pub = urlObj.hostname.replace(/^www\./, '');
          finalPublisher = pub.charAt(0).toUpperCase() + pub.slice(1);
        } catch (e) {
          finalPublisher = 'Source';
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

    results.push({ publisher: finalPublisher, url: finalUrl, year });
    lastIndex = urlRegex.lastIndex;
  }
  
  return deduplicateAndEnhancePublishers(results);
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
