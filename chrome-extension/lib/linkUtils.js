/**
 * Link Extraction and Hyperlinking Utilities (JavaScript Port)
 */

const LinkUtils = (() => {
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

  function cleanPublisherText(text) {
    if (!text) return '';
    let clean = text
      .replace(/^[,\-\(\)\s\t\n;:*|\\\/\u2013\u2014\u2022\u00b7\u2219\u25cf\u2043\u2023]+/, '') 
      .replace(/[,\-\(\)\s\t\n;:*|\\\/\u2013\u2014\u2022\u00b7\u2219\u25cf\u2043\u2023]+$/, '') 
      .trim();
      
    clean = clean.replace(/^(?:Sources?|References?)\s*[:\-–—\s]*/i, '').trim();
    
    const parts = clean.split(/[,;:]/).map(p => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      if (/^\d{4}$/.test(parts[parts.length - 1])) {
        parts.pop();
      }
      clean = parts.join(', ').trim();
    }
    
    return clean;
  }

  function appendUrlTitleToPublisher(publisher, urlStr) {
    if (!urlStr) return publisher;
    try {
      const url = new URL(urlStr.startsWith('http') ? urlStr : 'https://' + urlStr);
      let pathname = url.pathname;
      
      pathname = pathname.replace(/\/$/, '').replace(/\.[a-zA-Z0-9]+$/, '');
      
      if (!pathname || pathname === '/') return publisher;
      
      const segments = pathname.split('/').filter(Boolean);
      if (segments.length === 0) return publisher;
      
      let lastSegment = '';
      const ignoredSegments = new Set([
        'en', 'fr', 'es', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ru', 'ar', 
        'home', 'index', 'default', 'main', 'page', 'post', 'article'
      ]);
      
      for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i].trim().toLowerCase();
        if (!seg || ignoredSegments.has(seg) || /^\d+$/.test(seg) || /^[a-f0-9]{10,}$/.test(seg)) {
          continue;
        }
        lastSegment = segments[i];
        break;
      }
      
      if (!lastSegment && segments.length > 0) {
        lastSegment = segments[segments.length - 1];
      }
      
      if (!lastSegment) return publisher;
      
      let decoded = lastSegment;
      try {
        decoded = decodeURIComponent(lastSegment);
      } catch (e) {}
      
      let wordsStr = decoded.replace(/[-_]+/g, ' ').trim();
      if (!wordsStr) return publisher;
      
      const words = wordsStr.split(' ').filter(word => !/^\d{9}$/.test(word));
      const capitalized = words.map((word, idx) => {
        if (!word) return '';
        const lower = word.toLowerCase();
        
        const shortWords = ['to', 'on', 'in', 'of', 'and', 'the', 'a', 'an', 'for', 'with', 'at', 'by', 'from', 'as'];
        if (shortWords.includes(lower) && idx > 0) {
          return lower;
        }
        
        if (lower === 'ai') return 'AI';
        if (lower === 'us') return 'Us';
        if (/^q[1-4]$/i.test(lower)) return lower.toUpperCase();
        
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      });
      
      if (capitalized.length > 0 && capitalized[0]) {
        capitalized[0] = capitalized[0].charAt(0).toUpperCase() + capitalized[0].slice(1);
      }
      
      const urlTitle = capitalized.join(' ');
      
      const escapedPub = publisher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pubRegex = new RegExp(`^${escapedPub}\\b\\s*[-–—:]*\\s*`, 'i');
      
      if (pubRegex.test(urlTitle)) {
        const strippedTitle = urlTitle.replace(pubRegex, '').trim();
        if (strippedTitle) {
          return `${publisher} - ${strippedTitle}`;
        }
        return publisher;
      }
      
      const pubPrefixRegex = new RegExp(`^${urlTitle}\\b`, 'i');
      if (pubPrefixRegex.test(publisher)) {
        return publisher;
      }
      
      return `${publisher} - ${urlTitle}`;
    } catch (e) {
      return publisher;
    }
  }

  function enhancePublisher(publisher, urlStr) {
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

  function deduplicateAndEnhancePublishers(links) {
    const seenUrls = new Set();
    const uniqueLinks = links.filter(link => {
      if (seenUrls.has(link.url)) return false;
      seenUrls.add(link.url);
      return true;
    });

    const publisherCounts = new Map();
    uniqueLinks.forEach(link => {
      const pubLower = link.publisher.toLowerCase();
      publisherCounts.set(pubLower, (publisherCounts.get(pubLower) || 0) + 1);
    });

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

  function isUrl(str) {
    const trimmed = str.trim();
    if (/^(?:https?:\/\/|www\.)/i.test(trimmed)) return true;
    const domainPattern = /^[a-zA-Z0-9-]+\.(?:com|org|net|io|ai|gov|edu|co|biz|info|me|us|so|uk|ca|de|fr|jp|au|br|in|ch|it|nl|se|no|es|mx|tv|app|dev|xyz|tech|online|store|co\.[a-z]{2})\b(?:\/[^\s]*)?$/i;
    return domainPattern.test(trimmed);
  }

  function resolveDomain(publisher, allDomainsInText = []) {
    const cleanPub = publisher.replace(/^[•●▪◦\-\*\s\d\.\(\)\[\]\:\,\;\u2013\u2014]+/, '').trim().toLowerCase();
    
    const COMMON_PUBLISHER_DOMAINS = {
      'tracxn': 'tracxn.com',
      'finovate': 'finovate.com',
      'businesswire': 'businesswire.com',
      'business wire': 'businesswire.com',
      'pr newswire': 'prnewswire.com',
      'prnewswire': 'prnewswire.com',
      'fintech futures': 'fintechfutures.com',
      'fintechfutures': 'fintechfutures.com',
      'financial it': 'financialit.net',
      'financialit': 'financialit.net',
      'smartkyc': 'smartkyc.com',
      'smartkyc.com': 'smartkyc.com',
      'private banker international': 'privatebankerinternational.com',
      'privatebankerinternational': 'privatebankerinternational.com',
      'ffnews': 'ffnews.com',
      'ffnews.com': 'ffnews.com',
      'finantix': 'finantix.com',
      'finantix website': 'finantix.com',
      'jalios': 'jalios.com'
    };

    if (COMMON_PUBLISHER_DOMAINS[cleanPub]) {
      return COMMON_PUBLISHER_DOMAINS[cleanPub];
    }

    if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,10}(?:\.[a-zA-Z]{2,10})?$/.test(cleanPub)) {
      return cleanPub;
    }

    const normPub = cleanPub.replace(/[^a-z0-9]/g, '');
    for (const domain of allDomainsInText) {
      const normDomain = domain.replace(/^www\./i, '').split('.')[0].replace(/[^a-z0-9]/g, '');
      if (normPub.includes(normDomain) || normDomain.includes(normPub)) {
        return domain.replace(/^(https?:\/\/)?(www\.)?/i, '');
      }
    }

    const safeName = cleanPub.replace(/[^a-z0-9-]/g, '');
    return safeName ? `${safeName}.com` : 'domain.com';
  }

  function getCanonicalPublisherName(publisher, urlStr) {
    const lower = publisher.trim().toLowerCase();
    
    if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,10}(?:\.[a-zA-Z]{2,10})?$/.test(lower)) {
      return publisher.trim();
    }

    if (publisher.includes(' - ')) {
      const parts = publisher.split(' - ');
      const brandPart = parts[0].trim();
      const rest = parts.slice(1).join(' - ');
      const canonicalBrand = getCanonicalPublisherName(brandPart, urlStr);
      return `${canonicalBrand} - ${rest}`;
    }

    const CANONICAL_PUBLISHERS = {
      'tracxn': 'Tracxn',
      'finovate': 'Finovate',
      'businesswire': 'BusinessWire',
      'business wire': 'BusinessWire',
      'pr newswire': 'PR Newswire',
      'prnewswire': 'PR Newswire',
      'fintech futures': 'Fintech Futures',
      'fintechfutures': 'Fintech Futures',
      'financial it': 'Financial IT',
      'financialit': 'Financial IT',
      'smartkyc': 'smartkyc.com',
      'smartkyc.com': 'smartkyc.com',
      'financialit.net': 'financialit.net',
      'private banker international': 'Private Banker International',
      'privatebankerinternational': 'Private Banker International',
      'ffnews': 'ffnews.com',
      'ffnews.com': 'ffnews.com',
      'finantix': 'Finantix',
      'finantix website': 'Finantix website'
    };

    if (CANONICAL_PUBLISHERS[lower]) {
      return CANONICAL_PUBLISHERS[lower];
    }

    const isGeneric = !publisher || 
                      publisher.length < 2 || 
                      /^(source|sources|reference|references|url|urls|link|links|website|websites|homepage|homepages|page|pages)$/i.test(publisher);
    if (isGeneric && urlStr) {
      try {
        const urlObj = new URL(urlStr.startsWith('http') ? urlStr : 'https://' + urlStr);
        const hostname = urlObj.hostname.replace(/^www\./i, '').toLowerCase();
        
        if (CANONICAL_PUBLISHERS[hostname]) {
          return CANONICAL_PUBLISHERS[hostname];
        }
        
        const domainParts = hostname.split('.');
        let brand = '';
        if (domainParts.length >= 2) {
          const secondToLast = domainParts[domainParts.length - 2];
          const isCommonTld = ['co', 'com', 'org', 'net', 'gov', 'edu', 'ltd'].includes(secondToLast);
          if (isCommonTld && domainParts.length >= 3) {
            brand = domainParts[domainParts.length - 3];
          } else {
            brand = domainParts[domainParts.length - 2];
          }
        } else {
          brand = domainParts[0] || '';
        }
        
        if (brand) {
          if (brand.toLowerCase() === 'blend360') return 'Blend360';
          if (brand.toLowerCase() === 'jalios') return 'Jalios';
          if (CANONICAL_PUBLISHERS[brand.toLowerCase()]) {
            return CANONICAL_PUBLISHERS[brand.toLowerCase()];
          }
          return brand.charAt(0).toUpperCase() + brand.slice(1);
        }
      } catch (e) {}
    }

    return publisher;
  }

  function extractLinks(text) {
    const results = [];
    let cleanText = text.replace(/^(?:#+\s*)?(?:Sources?|Use\s+Cases?|References?)[:\s\n]*/i, '').trim();
    cleanText = cleanText.replace(/<[^>]*>/g, ' ');

    const allDomainsInText = [];
    const domainExtractionRegex = /(?:https?:\/\/|www\.)?([a-zA-Z0-9-]+\.(?:com|org|net|io|ai|gov|edu|co|biz|info|me|us|so|uk|ca|de|fr|jp|au|br|in|ch|it|nl|se|no|es|mx|tv|app|dev|xyz|tech|online|store|co\.[a-z]{2}))\b/gi;
    let domainMatch;
    while ((domainMatch = domainExtractionRegex.exec(cleanText)) !== null) {
      if (domainMatch[1]) {
        allDomainsInText.push(domainMatch[1].toLowerCase());
      }
    }

    const initialSegments = cleanText.split(/[;\n|]+/);
    const splitRegex = /(?<=\))\s*[,;·\u00b7•●▪◦\-\u2013\u2014\u2219\u25cf\u2043\u2023./|\\*]*\s*(?=[^)]*\()/;
    const segments = [];
    for (const seg of initialSegments) {
      if (seg.trim()) {
        segments.push(...seg.split(splitRegex));
      }
    }
    const remainingSegments = [];
    const segmentRegex = /^\s*(.*?)\s*\(([^)]+)\)[.\s]*$/;

    for (const segment of segments) {
      if (!segment.trim()) continue;

      const match = segmentRegex.exec(segment);
      if (match) {
        const publisherRaw = match[1].trim();
        const insideRaw = match[2].trim();
        
        const items = insideRaw.split(',').map(item => item.trim()).filter(Boolean);
        const urls = [];
        const slugs = [];
        let year = '';

        for (const item of items) {
          if (isUrl(item)) {
            urls.push(item);
          } else if (/^\d{4}$/.test(item)) {
            year = item;
          } else {
            slugs.push(item);
          }
        }

        if (urls.length > 0) {
          let cleanedPublisher = cleanPublisherText(publisherRaw);
          cleanedPublisher = getCanonicalPublisherName(cleanedPublisher, urls[0]);

          for (const url of urls) {
            let finalUrl = url;
            if (!url.toLowerCase().startsWith('http') && !url.toLowerCase().startsWith('www.')) {
              finalUrl = 'https://' + url;
            } else if (url.toLowerCase().startsWith('www.')) {
              finalUrl = 'https://' + url;
            }
            results.push({ publisher: cleanedPublisher, url: finalUrl, year });
          }
          continue;
        } else if (slugs.length > 0 && publisherRaw) {
          const cleanedPublisher = cleanPublisherText(publisherRaw);
          const resolvedDomain = resolveDomain(cleanedPublisher, allDomainsInText);

          for (const slug of slugs) {
            const cleanSlug = slug.trim().replace(/\s+/g, '-').replace(/^\/+|\/+$/g, '');
            const finalUrl = `https://${resolvedDomain}/${cleanSlug}`;
            const finalPublisher = getCanonicalPublisherName(cleanedPublisher, finalUrl);
            results.push({ publisher: finalPublisher, url: finalUrl, year });
          }
          continue;
        }
      }
      remainingSegments.push(segment);
    }

    const remainingText = remainingSegments.join(' ');
    const urlRegex = /(?:^|[^a-zA-Z0-9])((?:https?:\/\/|www\.)[^\s\)\*>]+|[a-zA-Z0-9-]+\.(?:com|org|net|io|ai|gov|edu|co|biz|info|me|us|so|uk|ca|de|fr|jp|au|br|in|ch|it|nl|se|no|es|mx|tv|app|dev|xyz|tech|online|store|co\.[a-z]{2})\b(?:\/[^\s\)\*>]*[^\s\dots\)\*>\.,])?)/gi;
    let match;
    let lastIndex = 0;
    
    while ((match = urlRegex.exec(remainingText)) !== null) {
      const url = match[1]?.trim();
      if (!url) continue;

      const matchIndex = match.index + match[0].indexOf(match[1]);
      const endIndex = matchIndex + url.length;

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

      let beforeUrl = remainingText.substring(lastIndex, matchIndex).trim();
      if (beforeUrl.includes('\n')) {
        const lines = beforeUrl.split('\n');
        beforeUrl = lines[lines.length - 1].trim();
      }
      
      let publisher = cleanPublisherText(beforeUrl);
      let year = '';

      const parenMatch = publisher.match(/(.*?)\s*\((.*?)$/);
      if (parenMatch) {
         const outside = parenMatch[1].trim();
         let inside = parenMatch[2].replace(/\)$/, '').trim();
         
         if (inside) {
             inside = cleanPublisherText(inside);
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
              .replace(/^[,\-\(\)\s\t\n;:*|\\\/\u2013\u2014\u2022\u00b7\u2219\u25cf\u2043\u2023]+/, '') 
              .replace(/[,\-\(\)\s\t\n;:*|\\\/\u2013\u2014\u2022\u00b7\u2219\u25cf\u2043\u2023]+$/, '') 
              .trim();

            const isTldOnly = /^\.[a-z]{2,10}$/i.test(description);

            if (description && !isTldOnly) {
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

      finalPublisher = getCanonicalPublisherName(finalPublisher, finalUrl);
      
      const remainingTextLookahead = remainingText.substring(urlRegex.lastIndex);
      if (isNakedDomain && remainingTextLookahead.trim().startsWith(',')) {
        const nextCitationEnd = remainingTextLookahead.indexOf(')');
        const nextFullUrl = remainingTextLookahead.substring(0, nextCitationEnd > 0 ? nextCitationEnd : 50).match(/https?:\/\/[^\s\)]+/);
        if (nextFullUrl) {
          continue;
        }
      }

      results.push({ publisher: finalPublisher, url: finalUrl, year });
      lastIndex = urlRegex.lastIndex;
    }
    
    return deduplicateAndEnhancePublishers(results);
  }

  function generateSourceListHtml(text) {
    const links = extractLinks(text);
    if (links.length === 0) return text;

    let html = `<ul style="padding-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5em;">`;
    links.forEach(link => {
      html += `<li style="margin-bottom: 0.25em;"><a href="${link.url}" style="color: inherit; text-decoration: underline;">${link.publisher}</a></li>`;
    });
    html += '</ul>';
    return html;
  }

  function isPureSourceBlock(text, links) {
    if (!links || links.length === 0) return false;

    let textWithoutUrls = text;
    links.forEach(link => {
      const escapedUrl = link.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      textWithoutUrls = textWithoutUrls.replace(new RegExp(escapedUrl, 'gi'), '');
      
      const nakedUrl = link.url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
      if (nakedUrl.length > 4) {
        const escapedNaked = nakedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        textWithoutUrls = textWithoutUrls.replace(new RegExp(escapedNaked, 'gi'), '');
      }
    });

    const cleaned = textWithoutUrls
      .replace(/\(\s*(?:sources?|references?|ref|url|link)?\s*[:\d,\s]*\)/gi, '')
      .replace(/\[\s*(?:sources?|references?|ref|url|link)?\s*[:\d,\s]*\]/gi, '')
      .replace(/^[•●▪◦\-\*\s\d\.\(\)\[\]\:\,\;\u2013\u2014]+/g, '')
      .trim();

    if (!cleaned) return true;

    const startsWithSourcePrefix = /^(?:sources?|references?|ref|url|link|retrieved|accessed)\b/i.test(cleaned);
    if (startsWithSourcePrefix) {
      return cleaned.length < 150;
    }

    const words = cleaned
      .split(/[\s\t\n]+/)
      .map(w => w.replace(/[^a-zA-Z0-9'-]/g, ''))
      .filter(Boolean);

    if (words.length <= 3) {
      return true;
    }

    return false;
  }

  return {
    cleanPublisherText,
    extractLinks,
    generateSourceListHtml,
    isPureSourceBlock
  };
})();

// Export for ES/CommonJS if needed, otherwise it's on window
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LinkUtils;
} else {
  window.LinkUtils = LinkUtils;
}
