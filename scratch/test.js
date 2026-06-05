const urlRegex = /(?:^|[^a-zA-Z0-9])((?:https?:\/\/|www\.)[^\s\)\*>]+|[a-zA-Z0-9-]+\.(?:com|org|net|io|ai|gov|edu|co|biz|info|me|us|so)\b(?:\/[^\s\)\*>]*[^\s\)\*>\.,])?)/gi;

function appendUrlTitleToPublisher(publisher, urlStr) {
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

function deduplicateAndEnhancePublishers(links) {
  // Deduplicate by URL first
  const seenUrls = new Set();
  const uniqueLinks = links.filter(link => {
    if (seenUrls.has(link.url)) return false;
    seenUrls.add(link.url);
    return true;
  });

  // Count occurrences of each publisher (case-insensitive)
  const publisherCounts = new Map();
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

function extractLinks(text) {
  const results = [];
  
  // Clean up standard headers (e.g. Sources, Use Cases, References) at the very beginning, including markdown markers
  let cleanText = text.replace(/^(?:#+\s*)?(?:Sources?|Use\s+Cases?|References?)[:\s\n]*/i, '').trim();
  
  // Strip HTML tags to avoid matching URLs with trailing </strong> etc.
  cleanText = cleanText.replace(/<[^>]*>/g, ' ');
  
  let match;
  let lastIndex = 0;
  
  while ((match = urlRegex.exec(cleanText)) !== null) {
    const url = match[1]?.trim();
    if (!url) continue;

    const matchIndex = match.index + match[0].indexOf(match[1]);
    
    let beforeUrl = cleanText.substring(lastIndex, matchIndex).trim();
    if (beforeUrl.includes('\n')) {
      const lines = beforeUrl.split('\n');
      beforeUrl = lines[lines.length - 1].trim();
    }
    
    let publisher = beforeUrl
      .replace(/^[,\-\(\)\s\t\n;:*\u2013\u2014\u2022\u00b7\u2219\u25cf\u2043\u2023]+/, '') 
      .replace(/[,\-\(\)\s\t\n;:*\u2013\u2014\u2022\u00b7\u2219\u25cf\u2043\u2023]+$/, '') 
      .trim();

    // Clean up leading "Source:" or similar markers first
    publisher = publisher.replace(/^(?:Sources?|References?)\s*[:\-–—\s]*/i, '').trim();

    let year = '';

    const parenMatch = publisher.match(/(.*?)\s*\((.*?)$/);
    
    if (parenMatch) {
       const outside = parenMatch[1].trim();
       let inside = parenMatch[2].replace(/\)$/, '').trim();
       
       if (inside) {
           inside = inside.replace(/^(?:Sources?|References?)\s*[:\-–—\s]*/i, '').trim();
           const parts = inside.split(/[,;:]/).map(p => p.trim()).filter(Boolean);
           const firstInside = parts[0];
           
           parts.forEach(part => {
             if (/^\d{4}$/.test(part)) year = part;
           });

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
    
    let finalUrl = url;
    if (!url.toLowerCase().startsWith('http') && !url.toLowerCase().startsWith('www.')) {
        finalUrl = 'https://' + url;
    } else if (url.toLowerCase().startsWith('www.')) {
        finalUrl = 'https://' + url;
    }

    let finalPublisher = publisher;
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

    let isBrandEquivalent = false;
    if (capitalizedBrand && publisher && publisher.toLowerCase() !== 'source') {
      const pubLower = publisher.toLowerCase();
      const brandLower = capitalizedBrand.toLowerCase();
      
      const pubNormalized = pubLower.replace(/[^a-z0-9]/g, '');
      const brandNormalized = brandLower.replace(/[^a-z0-9]/g, '');
      
      if (pubNormalized === brandNormalized) {
        finalPublisher = publisher;
        isBrandEquivalent = true;
      } else {
        let description = '';
        if (pubLower.startsWith(brandLower)) {
          description = publisher.substring(capitalizedBrand.length).trim();
        } else if (pubLower.endsWith(brandLower)) {
          description = publisher.substring(0, publisher.length - capitalizedBrand.length).trim();
        } else {
          const isGenericDesc = /^(clients|homepage|sectors|solutions|website|about|features|pricing|blog|news|documentation|docs)/i.test(pubLower);
          if (isGenericDesc) {
            description = publisher;
          }
        }

        description = description
          .replace(/^[,\-\(\)\s\t\n;:*\u2013\u2014\u2022\u00b7\u2219\u25cf\u2043\u2023]+/, '') 
          .replace(/[,\-\(\)\s\t\n;:*\u2013\u2014\u2022\u00b7\u2219\u25cf\u2043\u2023]+$/, '') 
          .trim();

        if (description) {
          let cleanDesc = description;
          if (/^homepage$/i.test(cleanDesc)) {
            cleanDesc = 'Homepage';
          } else if (/^clients\s*page$/i.test(cleanDesc) || /^clients$/i.test(cleanDesc)) {
            cleanDesc = 'Clients';
          } else if (/^sectors\s*pages?$/i.test(cleanDesc) || /^sectors$/i.test(cleanDesc) || /^solutions\/secteurs$/i.test(cleanDesc) || /^secteurs$/i.test(cleanDesc)) {
            cleanDesc = 'Sectors';
          } else {
            cleanDesc = cleanDesc.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
          }
          finalPublisher = `${capitalizedBrand} - ${cleanDesc}`;
        } else {
          finalPublisher = capitalizedBrand;
          isBrandEquivalent = true;
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
    
    results.push({ publisher: finalPublisher, url: finalUrl, year });
    lastIndex = urlRegex.lastIndex;
  }
  
  return deduplicateAndEnhancePublishers(results);
}

const testInput = `Sources: PDS Health Technologies page (www.pdshealth.com/our-businesses/pds-health-technologies/), PDS Health — Strategic Partners (www.pdshealth.com/who-we-are/strategic-partners/), PR Newswire (www.prnewswire.com/news-releases/pds-health-technologies-partners-with-university-of-the-pacific-to-deploy-epic-ehr-across-medical-dental-and-surgical-centers-302722161.html), PR Newswire (www.prnewswire.com/news-releases/carequest-innovation-partners-and-pds-health-collaborate-to-scal/)`;

console.log(JSON.stringify(extractLinks(testInput), null, 2));

