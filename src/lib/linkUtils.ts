/**
 * Robust link extraction and hyperlinking utilities
 * Based on the logic from RichTextCopier.tsx
 */

export interface LinkData {
  publisher: string;
  url: string;
  year?: string;
}

export function cleanPublisherText(text: string): string {
  let clean = text
    .replace(/^[,\-\(\)\s\t\n;:*|\\\/\u2013\u2014\u2022\u00b7\u2219\u25cf\u2043\u2023]+/, '') 
    .replace(/[,\-\(\)\s\t\n;:*|\\\/\u2013\u2014\u2022\u00b7\u2219\u25cf\u2043\u2023]+$/, '') 
    .trim();
    
  // Clean up leading "Source:" or similar markers first, including any colons and spaces
  clean = clean.replace(/^(?:Sources?|References?)\s*[:\-–—\s]*/i, '').trim();
  
  // Remove trailing year/dates (e.g. ", 2026")
  const parts = clean.split(/[,;:]/).map(p => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    if (/^\d{4}$/.test(parts[parts.length - 1])) {
      parts.pop();
    }
    clean = parts.join(', ').trim();
  }
  
  return clean;
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
    
    // Find a suitable segment starting from the end
    let lastSegment = '';
    const ignoredSegments = new Set([
      'en', 'fr', 'es', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ru', 'ar', 
      'home', 'index', 'default', 'main', 'page', 'post', 'article'
    ]);
    
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i].trim().toLowerCase();
      // Skip if it's empty, a language code/ignored term, just digits, or a hex/hash ID
      if (!seg || ignoredSegments.has(seg) || /^\d+$/.test(seg) || /^[a-f0-9]{10,}$/.test(seg)) {
        continue;
      }
      lastSegment = segments[i];
      break;
    }
    
    // Fallback if all segments were ignored
    if (!lastSegment && segments.length > 0) {
      lastSegment = segments[segments.length - 1];
    }
    
    if (!lastSegment) return publisher;
    
    // Replace hyphens, underscores, %20 etc with spaces
    let decoded = lastSegment;
    try {
      decoded = decodeURIComponent(lastSegment);
    } catch (e) {}
    
    let wordsStr = decoded.replace(/[-_]+/g, ' ').trim();
    if (!wordsStr) return publisher;
    
    // Capitalize words
    const words = wordsStr.split(' ').filter(word => !/^\d{9}$/.test(word));
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

export function enhancePublisher(publisher: string, urlStr: string): string {
  try {
    const urlObj = new URL(urlStr.startsWith('http') ? urlStr : 'https://' + urlStr);
    const pathname = urlObj.pathname.replace(/\/$/, '').toLowerCase();
    
    if (urlObj.hostname.replace(/^www\./i, '') === 'jalios.com') {
      if (pathname === '/fr' || pathname === '/fr/' || pathname === '') {
        return 'Jalios - Homepage';
      } else if (pathname === '/fr/clients') {
        return 'Jalios - Clients';
      } else if (pathname === '/fr/solutions/secteurs') {
        return 'Jalios - Sectors';
      }
    }
  } catch (e) {}
  
  return appendUrlTitleToPublisher(publisher, urlStr);
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
      const enhancedPublisher = enhancePublisher(link.publisher, link.url);
      return {
        ...link,
        publisher: enhancedPublisher
      };
    }
    
    return link;
  });
}

const VERBS = new Set([
  'was', 'is', 'are', 'were', 'been', 'has', 'had', 'have',
  'acquired', 'founded', 'merged', 'purchased', 'bought', 'sold',
  'integrated', 'joined', 'provides', 'offers', 'helps', 'allows',
  'used', 'developed', 'built', 'created', 'launched', 'released',
  'serves', 'focuses', 'operates'
]);

const CITATION_WORDS = new Set([
  'source', 'sources', 'ref', 'refs', 'reference', 'references',
  'url', 'urls', 'link', 'links', 'at', 'see', 'from', 'http', 'https', 'www',
  'website', 'websites', 'homepage', 'homepages', 'page', 'pages', 'blog', 'blogs', 'news', 'portal', 'portals'
]);

const GENERIC_PUBLISHERS = new Set([
  'website', 'websites', 'webpage', 'webpages', 'web page', 'web pages',
  'link', 'links', 'source', 'sources', 'homepage', 'homepages', 'page', 'pages',
  'url', 'urls', 'online', 'site', 'sites', 'company website', 'company websites'
]);

/**
 * Extracts links from text and identifies publishers
 */
export function extractLinks(text: string): LinkData[] {
  const results: LinkData[] = [];
  
  // Clean up standard headers (e.g. Sources, Use Cases, References) at the very beginning, including markdown markers
  let cleanText = text.replace(/^(?:#+\s*)?(?:Sources?|Use\s+Cases?|References?)[:\s\n]*/i, '').trim();
  
  // Strip HTML tags to avoid matching URLs with trailing </strong> etc.
  cleanText = cleanText.replace(/<[^>]*>/g, ' ');

  // Split text into lines/segments by semicolon, vertical bar, newline, or adjacent parenthesized blocks
  const initialSegments = cleanText.split(/[;\n|]+/);
  const splitRegex = /(?<=\))\s*[,;·\u00b7•●▪◦\-\u2013\u2014\u2219\u25cf\u2043\u2023./|\\*]*\s*(?=[^)]*\()/;
  const segments: string[] = [];
  for (const seg of initialSegments) {
    if (seg.trim()) {
      segments.push(...seg.split(splitRegex));
    }
  }
  const remainingSegments: string[] = [];

  function isUrl(str: string): boolean {
    const trimmed = str.trim();
    if (/^(?:https?:\/\/|www\.)/i.test(trimmed)) return true;
    const domainPattern = /^[a-zA-Z0-9-]+\.(?:com|org|net|io|ai|gov|edu|co|biz|info|me|us|so|uk|ca|de|fr|jp|au|br|in|ch|it|nl|se|no|es|mx|tv|app|dev|xyz|tech|online|store|co\.[a-z]{2})\b(?:\/[^\s]*)?$/i;
    return domainPattern.test(trimmed);
  }

  // Regex to match a segment ending with a parenthesis block
  const segmentRegex = /^\s*(.*?)\s*\(([^)]+)\)[.\s]*$/;

  for (const segment of segments) {
    if (!segment.trim()) continue;

    const match = segmentRegex.exec(segment);
    if (match) {
      const publisherRaw = match[1].trim();
      const insideRaw = match[2].trim();
      
      const items = insideRaw.split(',').map(item => item.trim()).filter(Boolean);
      const urls: string[] = [];
      let year = '';

      for (const item of items) {
        if (isUrl(item)) {
          urls.push(item);
        } else if (/^\d{4}$/.test(item)) {
          year = item;
        }
      }

      if (urls.length > 0) {
        // We successfully parsed this segment as a parenthesized source group!
        let cleanedPublisher = cleanPublisherText(publisherRaw);

        // Try to get a publisher from non-url, non-year items inside parenthesis
        if (!cleanedPublisher || cleanedPublisher.length < 2 || /^(source|sources|reference|references|url|urls|link|links|website|websites|homepage|homepages|page|pages)$/i.test(cleanedPublisher)) {
          const nonUrlNonYearItems = items.filter(item => !isUrl(item) && !/^\d{4}$/.test(item));
          if (nonUrlNonYearItems.length > 0) {
            const candidate = cleanPublisherText(nonUrlNonYearItems[0]);
            if (candidate && candidate.length >= 2 && !/^(source|sources|reference|references|url|urls|link|links|website|websites|homepage|homepages|page|pages)$/i.test(candidate)) {
              cleanedPublisher = candidate;
            }
          }
        }

        for (const url of urls) {
          let finalUrl = url;
          if (!url.toLowerCase().startsWith('http') && !url.toLowerCase().startsWith('www.')) {
            finalUrl = 'https://' + url;
          } else if (url.toLowerCase().startsWith('www.')) {
            finalUrl = 'https://' + url;
          }

          let finalPublisher = cleanedPublisher;
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

          const isGeneric = !finalPublisher || 
                            finalPublisher.length < 2 || 
                            /^(source|sources|reference|references|url|urls|link|links|website|websites|homepage|homepages|page|pages)$/i.test(finalPublisher);

          if (isGeneric) {
            finalPublisher = capitalizedBrand || 'Source';
          }

          results.push({ publisher: finalPublisher, url: finalUrl, year });
        }
        continue;
      }
    }

    remainingSegments.push(segment);
  }

  // Fallback: process remaining segments
  const remainingText = remainingSegments.join(' ');
  const urlRegex = /(?:^|[^a-zA-Z0-9])((?:https?:\/\/|www\.)[^\s\)\*>]+|[a-zA-Z0-9-]+\.(?:com|org|net|io|ai|gov|edu|co|biz|info|me|us|so|uk|ca|de|fr|jp|au|br|in|ch|it|nl|se|no|es|mx|tv|app|dev|xyz|tech|online|store|co\.[a-z]{2})\b(?:\/[^\s\)\*>]*[^\s\dots\)\*>\.,])?)/gi;
  let match;
  let lastIndex = 0;
  
  while ((match = urlRegex.exec(remainingText)) !== null) {
    const url = match[1]?.trim();
    if (!url) continue;

    const matchIndex = match.index + match[0].indexOf(match[1]);
    const endIndex = matchIndex + url.length;

    // Check if it's a naked domain (no http/https or www.)
    const isNakedDomain = !/^(?:https?:\/\/|www\.)/i.test(url);
    if (isNakedDomain) {
      const beforeText = remainingText.substring(0, matchIndex);
      const afterText = remainingText.substring(endIndex);

      const lastWordMatch = beforeText.match(/([a-zA-Z0-9'-]+)\s*$/);
      const firstWordMatch = afterText.match(/^\s*([a-zA-Z0-9'-]+)/);

      const lastWord = lastWordMatch ? lastWordMatch[1].toLowerCase() : '';
      const firstWord = firstWordMatch ? firstWordMatch[1].toLowerCase() : '';

      const lastWordOriginal = lastWordMatch ? lastWordMatch[1] : '';
      const firstWordOriginal = firstWordMatch ? firstWordMatch[1] : '';

      const isLastWordSentence = lastWordOriginal && /^[a-z]/.test(lastWordOriginal) && !CITATION_WORDS.has(lastWord);
      const isFirstWordSentence = firstWordOriginal && /^[a-z]/.test(firstWordOriginal) && !CITATION_WORDS.has(firstWord);

      const isLastWordVerb = VERBS.has(lastWord);
      const isFirstWordVerb = VERBS.has(firstWord);

      const containsVerbs = remainingText.split(/\s+/).some(w => VERBS.has(w.toLowerCase().replace(/[^a-z]/g, '')));
      const hasExplicitSourcePrefix = /sources?\s*[:\-–—\s]/i.test(beforeText) || /\bsources?\b/i.test(beforeText);

      if ((isLastWordSentence || isFirstWordSentence || isLastWordVerb || isFirstWordVerb || containsVerbs) && !hasExplicitSourcePrefix) {
        continue;
      }
    }

    // Text between the last URL (or start) and this URL
    let beforeUrl = remainingText.substring(lastIndex, matchIndex).trim();
    if (beforeUrl.includes('\n')) {
      const lines = beforeUrl.split('\n');
      beforeUrl = lines[lines.length - 1].trim();
    }
    
    let publisher = cleanPublisherText(beforeUrl);
    let year = '';

    // Handle the case where there are parentheses before the URL (Source: Publisher, 2026, URL)
    const parenMatch = publisher.match(/(.*?)\s*\((.*?)$/);
    
    if (parenMatch) {
       const outside = parenMatch[1].trim();
       let inside = parenMatch[2].replace(/\)$/, '').trim();
       
       if (inside) {
           inside = cleanPublisherText(inside);
           const parts = inside.split(/[,;:]/).map(p => p.trim()).filter(Boolean);
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
       const parts = publisher.split(/[,;:]/).map(p => p.trim()).filter(Boolean);
       if (parts.length > 1) {
         publisher = parts[0];
         parts.forEach(part => {
           if (/^\d{4}$/.test(part)) year = part;
         });
       } else {
         publisher = publisher.trim();
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
    let isBrandEquivalent = false;
    if (capitalizedBrand && publisher && publisher.toLowerCase() !== 'source') {
      const pubLower = publisher.toLowerCase();
      
      if (GENERIC_PUBLISHERS.has(pubLower)) {
        finalPublisher = capitalizedBrand;
        isBrandEquivalent = true;
      } else {
        const brandLower = capitalizedBrand.toLowerCase();
        const pubNormalized = pubLower.replace(/[^a-z0-9]/g, '');
        const brandNormalized = brandLower.replace(/[^a-z0-9]/g, '');
        
        if (pubNormalized === brandNormalized) {
          finalPublisher = publisher;
          isBrandEquivalent = true;
        } else {
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
            .replace(/^[,\-\(\)\s\t\n;:*|\\\/\u2013\u2014\u2022\u00b7\u2219\u25cf\u2043\u2023]+/, '') 
            .replace(/[,\-\(\)\s\t\n;:*|\\\/\u2013\u2014\u2022\u00b7\u2219\u25cf\u2043\u2023]+$/, '') 
            .trim();

          const isTldOnly = /^\.[a-z]{2,10}$/i.test(description);

          if (description && !isTldOnly) {
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
            finalPublisher = isTldOnly ? publisher : capitalizedBrand;
            isBrandEquivalent = true;
          }
        }
      }
    } else if (capitalizedBrand) {
      finalPublisher = capitalizedBrand;
      isBrandEquivalent = true;
    }

    if (isBrandEquivalent && capitalizedBrand) {
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
            finalPublisher = appendUrlTitleToPublisher(finalPublisher, finalUrl);
          }
        } else {
          finalPublisher = appendUrlTitleToPublisher(finalPublisher, finalUrl);
        }
      } catch (e) {}
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
    const remainingTextLookahead = remainingText.substring(urlRegex.lastIndex);
    if (isNakedDomain && remainingTextLookahead.trim().startsWith(',')) {
      // Look ahead for a real URL in the same citation block
      const nextCitationEnd = remainingTextLookahead.indexOf(')');
      const nextFullUrl = remainingTextLookahead.substring(0, nextCitationEnd > 0 ? nextCitationEnd : 50).match(/https?:\/\/[^\s\)]+/);
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

/**
 * Checks if a block of text containing links is a pure source citation block (e.g. "Source: URL" or "Publisher - URL").
 * If it contains substantive narrative text/sentence structure, it is NOT considered a pure source block.
 */
export function isPureSourceBlock(text: string, links: LinkData[]): boolean {
  if (!links || links.length === 0) return false;

  // Clean the text to remove all URLs
  let textWithoutUrls = text;
  links.forEach(link => {
    // Escape URL for regex replacement
    const escapedUrl = link.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    textWithoutUrls = textWithoutUrls.replace(new RegExp(escapedUrl, 'gi'), '');
    
    // Also remove any naked version of the URL just in case
    const nakedUrl = link.url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    if (nakedUrl.length > 4) {
      const escapedNaked = nakedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      textWithoutUrls = textWithoutUrls.replace(new RegExp(escapedNaked, 'gi'), '');
    }
  });

  // Clean up any empty parentheses or brackets left behind by URL removal (e.g. "(Source: )", "()", "[ ]")
  // Clean up leading/trailing spaces, punctuation, list/bullet markers
  const cleaned = textWithoutUrls
    .replace(/\(\s*(?:sources?|references?|ref|url|link)?\s*[:\d,\s]*\)/gi, '')
    .replace(/\[\s*(?:sources?|references?|ref|url|link)?\s*[:\d,\s]*\]/gi, '')
    .replace(/^[•●▪◦\-\*\s\d\.\(\)\[\]\:\,\;\u2013\u2014]+/g, '')
    .trim();

  // If the remaining text is completely empty, it's definitely a pure source block (just a URL)
  if (!cleaned) return true;

  // Check if it starts with a source prefix
  const startsWithSourcePrefix = /^(?:sources?|references?|ref|url|link|retrieved|accessed)\b/i.test(cleaned);
  if (startsWithSourcePrefix) {
    // If it starts with a source prefix, it is a source block unless it is extremely long
    return cleaned.length < 150;
  }

  // If it doesn't start with a source prefix, check if it's a very short line consisting of few words
  // Split by whitespace and filter out empty strings/punctuation
  const words = cleaned
    .split(/[\s\t\n]+/)
    .map(w => w.replace(/[^a-zA-Z0-9'-]/g, ''))
    .filter(Boolean);

  // If there are 3 or fewer words (e.g., "ClimateAI", "Gartner Peer Insights", "Company Homepage"), it's likely just a publisher label/title next to a URL
  if (words.length <= 3) {
    return true;
  }

  return false;
}

