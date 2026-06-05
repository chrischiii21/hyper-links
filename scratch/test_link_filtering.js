const urlRegex = /(?:^|[^a-zA-Z0-9])((?:https?:\/\/|www\.)[^\s\)\*>]+|[a-zA-Z0-9-]+\.(?:com|org|net|io|ai|gov|edu|co|biz|info|me|us|so)\b(?:\/[^\s\)\*>]*[^\s\)\*>\.,])?)/gi;

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

function cleanPublisherText(text) {
  let clean = text
    .replace(/^[,\-\(\)\s\t\n;:*|\\\u2013\u2014\u2022\u00b7\u2219\u25cf\u2043\u2023]+/, '') 
    .replace(/[,\-\(\)\s\t\n;:*|\\\u2013\u2014\u2022\u00b7\u2219\u25cf\u2043\u2023]+$/, '') 
    .trim();
  clean = clean.replace(/^(?:Sources?|References?)\s*[:\-–—\s]*/i, '').trim();
  return clean;
}

function extractLinks(text) {
  const results = [];
  let cleanText = text.replace(/^(?:#+\s*)?(?:Sources?|Use\s+Cases?|References?)[:\s\n]*/i, '').trim();
  cleanText = cleanText.replace(/<[^>]*>/g, ' ');
  
  let match;
  let lastIndex = 0;
  
  while ((match = urlRegex.exec(cleanText)) !== null) {
    const url = match[1]?.trim();
    if (!url) continue;

    const matchIndex = match.index + match[0].indexOf(match[1]);
    const endIndex = matchIndex + url.length;
    
    // Check if it's a naked domain
    const isNakedDomain = !/^(?:https?:\/\/|www\.)/i.test(url);
    if (isNakedDomain) {
      const beforeText = cleanText.substring(0, matchIndex);
      const afterText = cleanText.substring(endIndex);
      
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
      
      const containsVerbs = cleanText.split(/\s+/).some(w => VERBS.has(w.toLowerCase().replace(/[^a-z]/g, '')));
      const hasExplicitSourcePrefix = /sources?\s*[:\-–—\s]/i.test(beforeText) || /\bsources?\b/i.test(beforeText);
      
      if ((isLastWordSentence || isFirstWordSentence || isLastWordVerb || isFirstWordVerb || containsVerbs) && !hasExplicitSourcePrefix) {
        continue;
      }
    }

    let beforeUrl = cleanText.substring(lastIndex, matchIndex).trim();
    if (beforeUrl.includes('\n')) {
      const lines = beforeUrl.split('\n');
      beforeUrl = lines[lines.length - 1].trim();
    }
    
    let publisher = cleanPublisherText(beforeUrl);
    results.push({ publisher, url });
    lastIndex = urlRegex.lastIndex;
  }
  return results;
}

const inputStr = `Sources: Synavision CB Insights profile, https://www.cbinsights.com/company/synavision | Synavision AMEV 178 press release, https://www.synavision.de/en/news-posts/ | Synavision ai.lab, https://www.synavision.de/en/ailab/ | MarketDataForecast (Europe Energy Management Systems Market, 2024), https://www.marketdataforecast.com/market-reports/europe-energy-management-systems-market`;

console.log("Input:", inputStr);
const res = extractLinks(inputStr);
console.log("Extracted links:", JSON.stringify(res, null, 2));
