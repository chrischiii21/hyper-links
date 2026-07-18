/**
 * Hyperlinks Auto-Paster - Extension Popup Logic
 * Performs client-side DOCX/text parsing, subheader/table sanitization,
 * smart field auto-mapping, and programmatic injection.
 */

// 10 Standard report sections in order
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

// Mapping Roman numerals (parsed from text) to section indices
const ROMAN_MAP = {
  "I": 0, "II": 1, "III": 2, "IV": 3, "V": 4, 
  "VI": 5, "VII": 6, "VIII": 7, "IX": 8, "X": 9
};

const prefixPattern = `(?:[o\\s\\u2013\\u2014\\u2022-]*)(?:(?:[A-Za-z0-9]+[.:\\s\\u2013\\u2014)-]+)*)?`;
const titleRegex = new RegExp(`^${prefixPattern}(${MATCH_PATTERNS.join('|')})\\s*$`, 'i');

// Global parsed data state
let parsedSections = Array(10).fill(null).map((_, i) => ({
  id: i + 1,
  title: TARGET_TITLES[i],
  html: '',
  plainText: ''
}));
let pageFields = [];

// DOM Elements
const tabUpload = document.getElementById('tab-upload');
const tabPaste = document.getElementById('tab-paste');
const tabSanitize = document.getElementById('tab-sanitize');
const tabCompare = document.getElementById('tab-compare');
const uploadContent = document.getElementById('upload-tab-content');
const pasteContent = document.getElementById('paste-tab-content');
const sanitizeContent = document.getElementById('sanitize-tab-content');
const compareContent = document.getElementById('compare-tab-content');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const linkExtractorInput = document.getElementById('link-extractor-input');
const extractLinksBtn = document.getElementById('extract-links-btn');
const linkExtractorResult = document.getElementById('link-extractor-result');
const linkExtractorPreview = document.getElementById('link-extractor-preview');
const copyLinksBtn = document.getElementById('copy-links-btn');
const sanitizeInput = document.getElementById('sanitize-input');
const sanitizeBtn = document.getElementById('sanitize-btn');
const sanitizeResult = document.getElementById('sanitize-result');
const sanitizePreview = document.getElementById('sanitize-preview');
const copySanitizeBtn = document.getElementById('copy-sanitize-btn');
const statusContainer = document.getElementById('status-container');
const companyBanner = document.getElementById('company-banner');
const companyBannerText = document.getElementById('company-banner-text');
const companyBannerCopyBtn = document.getElementById('company-banner-copy-btn');
const mappingSection = document.getElementById('mapping-section');
const mappingList = document.getElementById('mapping-list');
const refreshFieldsBtn = document.getElementById('refresh-fields-btn');
const autoPasteBtn = document.getElementById('auto-paste-btn');
const spDropzone = document.getElementById('sp-dropzone');
const spFileInput = document.getElementById('sp-file-input');
const spToolbar = document.getElementById('sp-toolbar');
const spSearch = document.getElementById('sp-search');
const spClearBtn = document.getElementById('sp-clear-btn');
const spCompareList = document.getElementById('sp-compare-list');

// Tracks whether a report has been parsed and Section Mapping has content to show, since
// mapping-section's visibility is gated by both this and the active tab (see switchTab).
let mappingSectionHasData = false;

// --- Tab Controller ---
const TABS = {
  upload: { button: tabUpload, content: uploadContent },
  paste: { button: tabPaste, content: pasteContent },
  sanitize: { button: tabSanitize, content: sanitizeContent },
  compare: { button: tabCompare, content: compareContent }
};

Object.keys(TABS).forEach(mode => {
  TABS[mode].button.addEventListener('click', () => switchTab(mode));
});

function switchTab(mode) {
  Object.keys(TABS).forEach(key => {
    const isActive = key === mode;
    TABS[key].button.classList.toggle('active', isActive);
    TABS[key].content.classList.toggle('active', isActive);
  });
  // Section Mapping lives outside the tab-content divs (it sits below all of them, next to
  // the Automate Pasting button), so it doesn't get hidden by the toggle above on its own -
  // it's only ever relevant to the Ingest tab, so tie its visibility to both the active tab
  // and whether a report has actually been parsed yet.
  mappingSection.style.display = (mode === 'upload' && mappingSectionHasData) ? 'block' : 'none';
}

// --- Back to Top ---
const backToTopBtn = document.getElementById('back-to-top-btn');
window.addEventListener('scroll', () => {
  backToTopBtn.classList.toggle('show', window.scrollY > 200);
});
backToTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// --- Drag & Drop / File Upload Handlers ---
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

// --- Link Extractor handler (backup tool for links that didn't auto-hyperlink) ---
extractLinksBtn.addEventListener('click', () => {
  const text = linkExtractorInput.value.trim();
  if (!text) {
    showStatus('Please paste some text first.', 'error');
    return;
  }
  runLinkExtraction(text);
});

copyLinksBtn.addEventListener('click', () => {
  copyRichHtmlToClipboard(extractedLinksHtml, extractedLinksText, 'Parsed links copied to clipboard!');
});

// --- Sanitize Bullets handler (ports the webapp's "Sanitize Bullets" tool) ---
sanitizeBtn.addEventListener('click', () => {
  const text = sanitizeInput.value.trim();
  if (!text) {
    showStatus('Please paste some text first.', 'error');
    return;
  }
  runBulletSanitize(text);
});

copySanitizeBtn.addEventListener('click', () => {
  copyRichHtmlToClipboard(sanitizedHtml, sanitizedText, 'Sanitized bullets copied to clipboard!');
});

// --- Automatic page-change detection ---
// Keeps the Section Mapping field list in sync with whatever page currently has focus,
// so switching tabs (or switching records inside a single-page app like Airtable, which
// never does a full page reload) doesn't require a manual "Re-scan Fields" click.
let autoScanDebounceTimer = null;
function scheduleAutoScan() {
  if (!mappingSectionHasData) return; // nothing parsed yet
  clearTimeout(autoScanDebounceTimer);
  autoScanDebounceTimer = setTimeout(() => scanPageFields({ silent: true }), 250);
}

// Switching to a different browser tab
chrome.tabs.onActivated.addListener(() => scheduleAutoScan());

// Switching focus between browser windows
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) scheduleAutoScan();
});

// A full page load/reload finishing in the active tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.status === 'complete') scheduleAutoScan();
});

// Single-page apps (Airtable included) swap records/views via history.pushState without a
// full reload - onUpdated above won't fire for that, so this catches it separately.
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId !== 0) return; // top frame only
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].id === details.tabId) scheduleAutoScan();
  });
});

// --- Action Listeners ---
refreshFieldsBtn.addEventListener('click', () => {
  scanPageFields();
});

autoPasteBtn.addEventListener('click', () => {
  executeAutoPasting();
});

// --- Status Banner Helper ---
function showStatus(message, type = 'info') {
  statusContainer.innerHTML = '';
  
  const card = document.createElement('div');
  card.className = `status-card ${type}`;
  
  if (type === 'info') {
    card.innerHTML = `<div class="spinner"></div><span>${message}</span>`;
  } else if (type === 'success') {
    card.innerHTML = `
      <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      <span>${message}</span>
    `;
  } else if (type === 'error') {
    card.innerHTML = `
      <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      <span>${message}</span>
    `;
  }
  
  statusContainer.appendChild(card);
}

// --- Company Banner Helper: kept sticky at the top of the panel so it's always visible
// which report/company is currently loaded, no matter which tab you're on or how far
// you've scrolled. Source files are named "<Company Name> - Audit Report.docx" (or
// similar), so the company name is just whatever comes before the first dash. ---
function deriveCompanyName(fileName) {
  const base = fileName.replace(/\.(docx|txt)$/i, '').trim();
  const beforeDash = base.split(/\s*[-–—]\s*/)[0].trim();
  return beforeDash || base;
}

function setCompanyBanner(fileName) {
  const name = deriveCompanyName(fileName);
  companyBannerText.textContent = name;
  companyBanner.style.display = name ? 'flex' : 'none';
  chrome.storage.local.set({ lastCompanyName: name });
}

companyBannerCopyBtn.addEventListener('click', () => {
  const name = companyBannerText.textContent;
  if (!name) return;
  navigator.clipboard.writeText(name).then(() => {
    companyBannerCopyBtn.classList.add('copied');
    setTimeout(() => companyBannerCopyBtn.classList.remove('copied'), 800);
  });
});

// Restore the last known company name across panel close/reopen, same as the Compare
// tab's restored report below - this one just isn't tab-specific.
chrome.storage.local.get('lastCompanyName', (data) => {
  if (data && data.lastCompanyName) {
    companyBannerText.textContent = data.lastCompanyName;
    companyBanner.style.display = 'flex';
  }
});

// --- Parse Core: File Ingestion ---
async function handleFile(file) {
  showStatus('Ingesting and processing file...', 'info');
  setCompanyBanner(file.name);
  mappingSectionHasData = false;
  mappingSection.style.display = 'none';

  try {
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.docx')) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target.result;
          const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
          processDocxHtml(result.value);
        } catch (err) {
          console.error(err);
          showStatus('Error parsing DOCX file: ' + err.message, 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (fileName.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        handlePastedText(e.target.result);
      };
      reader.readAsText(file);
    } else {
      showStatus('Unsupported file format. Please upload a .docx or .txt file.', 'error');
    }
  } catch (err) {
    showStatus('Processing failed: ' + err.message, 'error');
  }
}

// --- Ingestion Pipeline: DOCX parsing (Matches api/extract.ts) ---
function processDocxHtml(htmlContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  // PRE-PROCESS: Clean empty nodes
  doc.querySelectorAll('p, div, span').forEach(el => {
    const text = el.textContent.trim();
    const html = el.innerHTML || '';
    if (!text && (html === '' || html === '&nbsp;' || html === '<br>' || html === '<br/>')) {
      el.remove();
    }
  });

  // Helper to identify the section index of an element in the DOM
  const getSectionIndexForElement = (el) => {
    let parent = el;
    while (parent && parent.parentElement && parent.parentElement.tagName !== 'BODY') {
      parent = parent.parentElement;
    }
    if (!parent) return -1;
    
    const children = Array.from(doc.body.children);
    let currentIdx = -1;
    
    for (const child of children) {
      if (child === parent) break;
      
      const text = child.textContent.trim();
      const match = titleRegex.exec(text);
      if (match) {
        const matchedTitle = match[1];
        currentIdx = MATCH_PATTERNS.findIndex(pattern => new RegExp(`^${pattern}$`, 'i').test(matchedTitle));
      }
    }
    
    return currentIdx;
  };

  // Convert sub-headers to H2
  const escapedSubHeaders = SUB_HEADERS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const subHeaderRegex = new RegExp(`^${prefixPattern}(${escapedSubHeaders})\\s*[:\\-\\u2013\\u2014]?\\s*(.*)$`, 'is');
  const titleRegexHtml = new RegExp(`^(?:<[^>]+>|\\s)*${prefixPattern}(${escapedSubHeaders})(?:<[^>]+>|\\s)*[:\\-\\u2013\\u2014]?(?:<[^>]+>|\\s)*`, 'i');

  doc.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, span, strong, b, em, i').forEach(el => {
    // Skip sub-headers inside Executive Summary (index 0)
    if (getSectionIndexForElement(el) === 0) return;
    
    const text = el.textContent.trim();
    const cleanCompareText = text.replace(/[:\-\u2013\u2014]$/, '').trim();
    const match = subHeaderRegex.exec(text);
    
    if (match) {
      let innerText = match[1];
      const remainingText = match[2];
      
      // Normalize
      const normalizeForComparison = (str) => {
        return str
          .toLowerCase()
          .replace(/\b(and|&)\b/g, 'and')
          .replace(/[^a-z0-9]/g, '')
          .trim();
      };
      
      const normalizedInner = normalizeForComparison(innerText);
      
      // Duplicate checks
      let block = el;
      while (block && ['span', 'strong', 'b', 'em', 'i'].includes(block.tagName.toLowerCase())) {
        block = block.parentElement;
      }
      let hasDuplicate = false;
      const prevBlock = block ? block.previousElementSibling : null;
      if (prevBlock) {
        const prevTagName = prevBlock.tagName.toLowerCase();
        const isHeader = /^h[1-6]$/.test(prevTagName) || prevBlock.getAttribute('data-subheader') === 'true';
        if (isHeader && normalizeForComparison(prevBlock.textContent.trim()) === normalizedInner) {
          hasDuplicate = true;
        }
      }
      if (hasDuplicate) return;

      const canonicalHeader = SUB_HEADERS.find(h => normalizeForComparison(h) === normalizedInner);
      if (canonicalHeader) {
        innerText = canonicalHeader;
      }

      if (innerText.toLowerCase() === 'company overview') {
        innerText = '%%COMPANY_OVERVIEW_PLACEHOLDER%%';
      }
      if (innerText.toLowerCase() === 'additional note' || innerText.toLowerCase() === 'additional notes') {
        innerText = 'Additional Important Note';
      }

      const matchesMainTitle = MATCH_PATTERNS.some(pattern => 
        new RegExp(`^${prefixPattern}${pattern}\\s*$`, 'i').test(cleanCompareText)
      );
      if (matchesMainTitle) return;

      // Create new H2
      const h2 = document.createElement('h2');
      h2.setAttribute('data-subheader', 'true');
      h2.style.fontWeight = '300';
      h2.style.marginTop = '1.5em';
      h2.style.marginBottom = '0.5em';
      h2.style.fontSize = '1.25em';
      h2.innerHTML = `<span style="font-weight: 300;">${innerText}</span>`;

      if (['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'em', 'i', 'strong', 'b'].includes(el.tagName.toLowerCase())) {
        if (remainingText && remainingText.trim().length > 0) {
          if (innerText.toLowerCase().startsWith('source')) {
            const links = LinkUtils.extractLinks(remainingText);
            if (links.length > 0) {
              const label = links.length === 1 ? 'Source' : 'Sources';
              h2.innerHTML = `<span style="font-weight: 300;">${label}</span>`;
              const linksHtml = LinkUtils.generateSourceListHtml(remainingText);
              
              const divContainer = document.createElement('div');
              divContainer.appendChild(h2);
              const ulNode = document.createElement('div');
              ulNode.innerHTML = linksHtml;
              divContainer.appendChild(ulNode.firstElementChild);
              el.replaceWith(...divContainer.childNodes);
              return;
            }
          }

          let finalHtml = remainingText.trim();
          const rawHtml = el.innerHTML || '';
          const htmlMatch = titleRegexHtml.exec(rawHtml);
          if (htmlMatch) {
            finalHtml = rawHtml.substring(htmlMatch[0].length).trim();
          }
          finalHtml = finalHtml.replace(/^[.\s,;:\-\u2013\u2014\u2022]+/, '').trim();

          if (finalHtml.length > 0) {
            const newTag = el.tagName.toLowerCase() === 'li' ? 'li' : 'p';
            const contentPara = document.createElement(newTag);
            contentPara.innerHTML = finalHtml;
            
            const wrapper = document.createDocumentFragment();
            wrapper.appendChild(h2);
            wrapper.appendChild(contentPara);
            el.replaceWith(wrapper);
          } else {
            el.replaceWith(h2);
          }
        } else {
          el.replaceWith(h2);
        }
      }
    }
  });

  // Table Cell Formatting
  const formatCellAsBullets = (cell) => {
    let rawHtml = cell.innerHTML || '';
    rawHtml = rawHtml.replace(/<br\s*\/?>/gi, '\n');
    rawHtml = rawHtml.replace(/<\/p>\s*<p[^>]*>/gi, '\n');
    let text = rawHtml.replace(/<[^>]+>/g, '').trim();
    
    const hasNewlines = text.includes('\n');
    const hasBullets = (text.match(/[•\u2022]/g) || []).length > 0;
    
    let rawItems = [];
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
    rawItems.forEach(item => {
      let cleanItem = item.replace(/^[•\-\u2022\u2013\u2014\s\t*]+/, '').trim();
      if (cleanItem) {
        listHtml += `<li style="margin-bottom: 0.25em;">${cleanItem}</li>`;
        validItems++;
      }
    });
    listHtml += '</ul>';

    if (validItems > 0 && (validItems > 1 || hasBullets || hasNewlines)) {
      cell.innerHTML = listHtml;
    }
  };

  doc.querySelectorAll('table').forEach(table => {
    let keyFuncColIndex = -1;
    const firstRowCells = table.querySelectorAll('tr:first-child th, tr:first-child td');
    firstRowCells.forEach((cell, idx) => {
      if (cell.textContent.trim().toLowerCase().includes('key functionalities')) {
        keyFuncColIndex = idx;
      }
    });

    if (keyFuncColIndex !== -1) {
      const rows = table.querySelectorAll('tr');
      rows.forEach((row, idx) => {
        if (idx === 0) return;
        const targetCell = row.querySelectorAll('td')[keyFuncColIndex];
        if (targetCell) formatCellAsBullets(targetCell);
      });
    }

    table.querySelectorAll('tr').forEach(row => {
      const firstCell = row.querySelector('th, td');
      if (firstCell && firstCell.textContent.trim().toLowerCase().includes('key functionalities')) {
        const nextCell = firstCell.nextElementSibling;
        if (nextCell && nextCell.tagName.toLowerCase() === 'td') {
          formatCellAsBullets(nextCell);
        }
      }
    });
  });

  // Split into sections
  const extractedSections = [];
  let currentTargetIndex = -1;
  let currentHtmlParts = [];

  Array.from(doc.body.children).forEach(el => {
    if (el.getAttribute('data-subheader') === 'true') {
      if (currentTargetIndex !== -1) {
        currentHtmlParts.push(el.outerHTML);
      }
      return;
    }

    const text = el.textContent.trim();
    const match = titleRegex.exec(text);
    
    if (match) {
      const matchedTitle = match[1];
      const newTargetIndex = MATCH_PATTERNS.findIndex(pattern => new RegExp(`^${pattern}$`, 'i').test(matchedTitle));
      
      if (newTargetIndex === currentTargetIndex) return;

      if (currentTargetIndex !== -1) {
        const existing = extractedSections.find(s => s.originalIndex === currentTargetIndex);
        if (existing) {
          existing.body += currentHtmlParts.join('');
        } else {
          extractedSections.push({ originalIndex: currentTargetIndex, body: currentHtmlParts.join('') });
        }
      }
      currentTargetIndex = newTargetIndex;
      currentHtmlParts = [];
    } else {
      if (currentTargetIndex !== -1) {
        currentHtmlParts.push(el.outerHTML);
      }
    }
  });

  if (currentTargetIndex !== -1) {
    const existing = extractedSections.find(s => s.originalIndex === currentTargetIndex);
    if (existing) {
      existing.body += currentHtmlParts.join('');
    } else {
      extractedSections.push({ originalIndex: currentTargetIndex, body: currentHtmlParts.join('') });
    }
  }

  // Populate global parsed sections
  for (let i = 0; i < 10; i++) {
    const found = extractedSections.find(s => s.originalIndex === i);
    let bodyHtml = found ? found.body : "<p>No content found for this section.</p>";

    // Placeholders
    if (i === 0) {
      bodyHtml = bodyHtml.replace(/%%COMPANY_OVERVIEW_PLACEHOLDER%%/g, 'Company Overview');
    } else {
      bodyHtml = bodyHtml.replace(/%%COMPANY_OVERVIEW_PLACEHOLDER%%/g, 'Value Proposition');
    }

    // Process specific sections
    bodyHtml = finalizeSectionHtml(i, bodyHtml);

    parsedSections[i] = {
      id: i + 1,
      title: TARGET_TITLES[i],
      html: bodyHtml,
      plainText: convertHtmlToPlainText(bodyHtml)
    };
  }

  showStatus('Document processed client-side!', 'success');
  scanPageFields();
}

// --- Ingestion Pipeline: Pasted text parsing (Matches api/extract-paste.ts) ---
async function handlePastedText(text) {
  showStatus('Processing report text...', 'info');
  mappingSectionHasData = false;
  mappingSection.style.display = 'none';

  try {
    const lines = text.split('\n');
    let isInRebuiltReport = false;
    let currentSectionIndex = -1;
    let sectionContents = Array(10).fill('');

    // Quick check to see if "Part 2: Rebuilt Report" block exists
    const hasRebuiltPrefix = text.includes('Part 2: Rebuilt Report');
    if (!hasRebuiltPrefix) {
      isInRebuiltReport = true; // Parse everything if prefix is missing
    }

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
        // Look for "# Section I" or similar
        const sectionMatch = line.match(/^#+\s+Section\s+([IVX]+)/i);
        if (sectionMatch) {
          const roman = sectionMatch[1].toUpperCase();
          if (ROMAN_MAP[roman] !== undefined) {
            currentSectionIndex = ROMAN_MAP[roman];
            continue;
          }
        }
        
        // Also support parsing actual standard headings if roman numerals aren't there
        const match = titleRegex.exec(line);
        if (match) {
          const matchedTitle = match[1];
          const foundIdx = MATCH_PATTERNS.findIndex(pattern => new RegExp(`^${pattern}$`, 'i').test(matchedTitle));
          if (foundIdx !== -1) {
            currentSectionIndex = foundIdx;
            continue;
          }
        }

        if (currentSectionIndex !== -1) {
          sectionContents[currentSectionIndex] += lines[i] + '\n';
        }
      }
    }

    // Process markdown conversion and sanitization
    for (let i = 0; i < 10; i++) {
      const rawMarkdown = sectionContents[i].trim();
      let bodyHtml = '';
      
      if (!rawMarkdown) {
        bodyHtml = "<p>No content found for this section.</p>";
      } else {
        let processedMarkdown = rawMarkdown
          .split('\n')
          .map(line => {
            const trimmed = line.trim();
            if (/^[•●▪◦]\s*/.test(trimmed)) {
              return '- ' + trimmed.replace(/^[•●▪◦]\s*/, '');
            }
            return line;
          })
          .join('\n');

        // Parse markdown to HTML
        bodyHtml = marked.parse(processedMarkdown);
        
        // Formatting tables and sub-headers
        bodyHtml = finalizeSectionHtml(i, bodyHtml);
      }

      parsedSections[i] = {
        id: i + 1,
        title: TARGET_TITLES[i],
        html: bodyHtml,
        plainText: convertHtmlToPlainText(bodyHtml)
      };
    }

    showStatus('Report text processed successfully!', 'success');
    scanPageFields();
  } catch (err) {
    console.error(err);
    showStatus('Processing failed: ' + err.message, 'error');
  }
}

// --- Link Extractor: a standalone backup tool, independent of the section pipeline
// above. Some links on the source platform slip through without being hyperlinked -
// paste the surrounding text here to get back a clean "Sources" list to paste over
// just that spot, instead of re-running the whole report through the pipeline. ---
let extractedLinksHtml = '';
let extractedLinksText = '';

function runLinkExtraction(text) {
  const links = LinkUtils.extractLinks(text);

  if (links.length === 0) {
    linkExtractorResult.classList.remove('visible');
    showStatus('No links were found in that text.', 'error');
    return;
  }

  const label = links.length === 1 ? 'Source' : 'Sources';
  let html = `<h2 style="font-weight: 300; margin: 0 0 0.5em; font-size: 1.1em;"><span style="font-weight: 300;">${label}</span></h2>`;
  html += '<ul style="padding-left: 1.25rem; margin: 0;">';
  links.forEach(link => {
    html += `<li style="margin-bottom: 0.25em;"><a href="${link.url}" style="color: inherit; text-decoration: underline;">${link.publisher}</a></li>`;
  });
  html += '</ul>';

  extractedLinksHtml = html;
  extractedLinksText = links.map(link => `${link.publisher}: ${link.url}`).join('\n');

  linkExtractorPreview.innerHTML = html;
  linkExtractorResult.classList.add('visible');
  showStatus(`Found ${links.length} link${links.length === 1 ? '' : 's'}. Ready to copy.`, 'success');
}

// --- Sanitize Bullets: ports the webapp's RichTextCopier "Sanitize Bullets" tool.
// Cleans messy bullet points (•, -, *), capitalizes each line, and bolds the label
// before a colon (renaming "Company Overview:" to "Value Proposition:" to match the
// report pipeline's terminology). ---
let sanitizedHtml = '';
let sanitizedText = '';

function runBulletSanitize(text) {
  const hasSemicolons = text.includes(';');
  const hasBullets = (text.match(/[•]/g) || []).length > 1;
  const hasNewlines = text.includes('\n');
  const isSingleLine = !hasNewlines || text.split('\n').filter(l => l.trim()).length <= 1;

  let rawItems;
  if (hasSemicolons && isSingleLine) {
    rawItems = text.split(';');
  } else if (hasBullets && isSingleLine) {
    rawItems = text.split(/[•]/);
  } else {
    rawItems = text.split('\n');
  }

  const listItems = [];
  rawItems.forEach(item => {
    let cleanedLine = item.replace(/^[•\-\s\t*]+/, '').trim();
    if (!cleanedLine) return;

    cleanedLine = cleanedLine.charAt(0).toUpperCase() + cleanedLine.slice(1);
    let formattedLine = cleanedLine.replace(/^(.*?:\s)/, '<strong>$1</strong>');
    formattedLine = formattedLine.replace(/<strong>Company Overview:/i, '<strong>Value Proposition:');
    listItems.push(formattedLine);
  });

  if (listItems.length === 0) {
    sanitizeResult.classList.remove('visible');
    showStatus('No bullet points were found to sanitize.', 'error');
    return;
  }

  sanitizedHtml = `<ul style="padding-left: 1.25rem; margin: 0;">${listItems.map(li => `<li style="margin-bottom: 0.25em;">${li}</li>`).join('')}</ul>`;
  sanitizedText = listItems.map(li => li.replace(/<[^>]+>/g, '')).join('\n');

  sanitizePreview.innerHTML = sanitizedHtml;
  sanitizeResult.classList.add('visible');
  showStatus(`Sanitized ${listItems.length} bullet${listItems.length === 1 ? '' : 's'}. Ready to copy.`, 'success');
}

// --- Shared clipboard helper for the paste-in/paste-out tool tabs ---
async function copyRichHtmlToClipboard(html, plainText, successMessage) {
  if (!html) return;

  try {
    const htmlBlob = new Blob([html], { type: 'text/html' });
    const textBlob = new Blob([plainText], { type: 'text/plain' });
    const clipboardItem = new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob });
    await navigator.clipboard.write([clipboardItem]);
    showStatus(successMessage, 'success');
  } catch (err) {
    console.error('Failed to copy rich content:', err);
    try {
      await navigator.clipboard.writeText(plainText);
      showStatus(successMessage, 'success');
    } catch (e) {
      showStatus('Failed to copy to clipboard.', 'error');
    }
  }
}

// --- HTML post-processing logic (Consolidated and Section Specifics) ---
function finalizeSectionHtml(index, bodyHtml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(bodyHtml, 'text/html');

  // PRE-PROCESS: Clean empty nodes
  doc.querySelectorAll('p, div, span').forEach(el => {
    const text = el.textContent.trim();
    const html = el.innerHTML || '';
    if (!text && (html === '' || html === '&nbsp;' || html === '<br>' || html === '<br/>')) {
      el.remove();
    }
  });

  // Table bullets
  const formatCellAsBullets = (cell) => {
    let rawHtml = cell.innerHTML || '';
    rawHtml = rawHtml.replace(/<br\s*\/?>/gi, '\n');
    rawHtml = rawHtml.replace(/<\/p>\s*<p[^>]*>/gi, '\n');
    let text = rawHtml.replace(/<[^>]+>/g, '').trim();
    
    const hasNewlines = text.includes('\n');
    const hasBullets = (text.match(/[•\u2022]/g) || []).length > 0;
    
    let rawItems = [];
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
    rawItems.forEach(item => {
      let cleanItem = item.replace(/^[•\-\u2022\u2013\u2014\s\t*]+/, '').trim();
      if (cleanItem) {
        listHtml += `<li style="margin-bottom: 0.25em;">${cleanItem}</li>`;
        validItems++;
      }
    });
    listHtml += '</ul>';

    if (validItems > 0 && (validItems > 1 || hasBullets || hasNewlines)) {
      cell.innerHTML = listHtml;
    }
  };

  doc.querySelectorAll('table').forEach(table => {
    let keyFuncColIndex = -1;
    const firstRowCells = table.querySelectorAll('tr:first-child th, tr:first-child td');
    firstRowCells.forEach((cell, idx) => {
      if (cell.textContent.trim().toLowerCase().includes('key functionalities')) {
        keyFuncColIndex = idx;
      }
    });

    if (keyFuncColIndex !== -1) {
      const rows = table.querySelectorAll('tr');
      rows.forEach((row, idx) => {
        if (idx === 0) return;
        const targetCell = row.querySelectorAll('td')[keyFuncColIndex];
        if (targetCell) formatCellAsBullets(targetCell);
      });
    }

    table.querySelectorAll('tr').forEach(row => {
      const firstCell = row.querySelector('th, td');
      if (firstCell && firstCell.textContent.trim().toLowerCase().includes('key functionalities')) {
        const nextCell = firstCell.nextElementSibling;
        if (nextCell && nextCell.tagName.toLowerCase() === 'td') {
          formatCellAsBullets(nextCell);
        }
      }
    });
  });

  // SUB-HEADER PROCESSING
  const escapedSubHeaders = SUB_HEADERS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const subHeaderRegex = new RegExp(`^${prefixPattern}(${escapedSubHeaders})\\s*[:\\-\\u2013\\u2014]?\\s*(.*)$`, 'is');
  const titleRegexHtml = new RegExp(`^(?:<[^>]+>|\\s)*${prefixPattern}(${escapedSubHeaders})(?:<[^>]+>|\\s)*[:\\-\\u2013\\u2014]?(?:<[^>]+>|\\s)*`, 'i');

  if (index !== 0) {
    doc.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, span, strong, b, em, i').forEach(el => {
      const text = el.textContent.trim();
      const cleanCompareText = text.replace(/[:\-\u2013\u2014]$/, '').trim();
      const match = subHeaderRegex.exec(text);
      
      if (match) {
        let innerText = match[1];
        const remainingText = match[2];
        
        const normalizeForComparison = (str) => {
          return str.toLowerCase().replace(/\b(and|&)\b/g, 'and').replace(/[^a-z0-9]/g, '').trim();
        };
        const normalizedInner = normalizeForComparison(innerText);

        let block = el;
        while (block && ['span', 'strong', 'b', 'em', 'i'].includes(block.tagName.toLowerCase())) {
          block = block.parentElement;
        }
        let hasDuplicate = false;
        const prevBlock = block ? block.previousElementSibling : null;
        if (prevBlock) {
          const prevTagName = prevBlock.tagName.toLowerCase();
          const isHeader = /^h[1-6]$/.test(prevTagName) || prevBlock.getAttribute('data-subheader') === 'true';
          if (isHeader && normalizeForComparison(prevBlock.textContent.trim()) === normalizedInner) {
            hasDuplicate = true;
          }
        }
        if (hasDuplicate) return;

        const canonicalHeader = SUB_HEADERS.find(h => normalizeForComparison(h) === normalizedInner);
        if (canonicalHeader) {
          innerText = canonicalHeader;
        }

        if (innerText.toLowerCase() === 'company overview') {
          innerText = '%%COMPANY_OVERVIEW_PLACEHOLDER%%';
        }
        if (innerText.toLowerCase() === 'additional note' || innerText.toLowerCase() === 'additional notes') {
          innerText = 'Additional Important Note';
        }

        const matchesMainTitle = MATCH_PATTERNS.some(pattern => 
          new RegExp(`^${prefixPattern}${pattern}\\s*$`, 'i').test(cleanCompareText)
        );
        if (matchesMainTitle) return;

        const h2 = document.createElement('h2');
        h2.setAttribute('data-subheader', 'true');
        h2.style.fontWeight = '300';
        h2.style.marginTop = '1.5em';
        h2.style.marginBottom = '0.5em';
        h2.style.fontSize = '1.25em';
        h2.innerHTML = `<span style="font-weight: 300;">${innerText}</span>`;

        if (['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'em', 'i', 'strong', 'b'].includes(el.tagName.toLowerCase())) {
          if (remainingText && remainingText.trim().length > 0) {
            if (innerText.toLowerCase().startsWith('source')) {
              const links = LinkUtils.extractLinks(remainingText);
              if (links.length > 0) {
                const label = links.length === 1 ? 'Source' : 'Sources';
                h2.innerHTML = `<span style="font-weight: 300;">${label}</span>`;
                const linksHtml = LinkUtils.generateSourceListHtml(remainingText);
                const wrapper = document.createDocumentFragment();
                wrapper.appendChild(h2);
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = linksHtml;
                wrapper.appendChild(tempDiv.firstElementChild);
                el.replaceWith(wrapper);
                return;
              }
            }

            let finalHtml = remainingText.trim();
            const rawHtml = el.innerHTML || '';
            const htmlMatch = titleRegexHtml.exec(rawHtml);
            if (htmlMatch) {
              finalHtml = rawHtml.substring(htmlMatch[0].length).trim();
            }
            finalHtml = finalHtml.replace(/^[.\s,;:\-\u2013\u2014\u2022]+/, '').trim();

            if (finalHtml.length > 0) {
              const newTag = el.tagName.toLowerCase() === 'li' ? 'li' : 'p';
              const contentPara = document.createElement(newTag);
              contentPara.innerHTML = finalHtml;
              const wrapper = document.createDocumentFragment();
              wrapper.appendChild(h2);
              wrapper.appendChild(contentPara);
              el.replaceWith(wrapper);
            } else {
              el.replaceWith(h2);
            }
          } else {
            el.replaceWith(h2);
          }
        }
      }
    });
  }

  // --- Executive Summary specific transform ---
  if (index === 0) {
    // Strips block-level wrappers (p, div, h1-h6) from a cell's HTML, keeping their inner
    // content. Table cells promoted to list items must not carry heading formatting into
    // the bullet list - otherwise the heading-styling pass later re-styles it as a full
    // section header sitting inside a bullet.
    const stripBlockWrappers = (html) => {
      const temp = document.createElement('div');
      temp.innerHTML = html;
      temp.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6').forEach(el => {
        el.replaceWith(...el.childNodes);
      });
      return temp.innerHTML;
    };

    // 1. Tables to List Items
    doc.querySelectorAll('table').forEach(table => {
      const listItems = [];
      table.querySelectorAll('tr').forEach(tr => {
        const cells = tr.querySelectorAll('td, th');
        if (cells.length === 2) {
          const keyText = cells[0].textContent.trim();
          const valueHtml = stripBlockWrappers(cells[1].innerHTML || '');
          const valueText = cells[1].textContent.trim();
          
          if (keyText && valueText) {
            const cleanKey = keyText.replace(/:$/, '').trim();
            let cleanValue = valueHtml.replace(/^[•\-\u2022\u2013\u2014\s\t*:]+/, '').trim();
            listItems.push(`<li style="margin-bottom: 0.5em; line-height: 1.5; color: #334155;"><strong>${cleanKey}:</strong> ${cleanValue}</li>`);
          } else if (keyText || valueText) {
            const targetHtml = keyText ? stripBlockWrappers(cells[0].innerHTML || '') : valueHtml;
            let cleanHtml = targetHtml.replace(/^[•\-\u2022\u2013\u2014\s\t*:]+/, '').trim();
            listItems.push(`<li style="margin-bottom: 0.5em; line-height: 1.5; color: #334155;">${cleanHtml}</li>`);
          }
        } else if (cells.length === 1) {
          let cellHtml = stripBlockWrappers(cells[0].innerHTML || '');
          let cleanHtml = cellHtml.replace(/^[•\-\u2022\u2013\u2014\s\t*:]+/, '').trim();
          if (cleanHtml) {
            listItems.push(`<li style="margin-bottom: 0.5em; line-height: 1.5; color: #334155;">${cleanHtml}</li>`);
          }
        } else if (cells.length > 2) {
          const firstCellText = cells[0].textContent.trim();
          let cleanKey = firstCellText.replace(/:$/, '').trim();
          const remainingHtmlParts = [];
          
          Array.from(cells).slice(1).forEach(cell => {
            let cleanCell = stripBlockWrappers(cell.innerHTML || '').replace(/^[•\-\u2022\u2013\u2014\s\t*:]+/, '').trim();
            if (cleanCell) remainingHtmlParts.push(cleanCell);
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
        const ul = document.createElement('ul');
        ul.style.paddingLeft = '1.5rem';
        ul.style.marginTop = '0.5rem';
        ul.style.marginBottom = '0.5em';
        ul.innerHTML = listItems.join('\n');
        table.replaceWith(ul);
      } else {
        table.remove();
      }
    });

    // 2. Subheaders to bullet points
    doc.querySelectorAll('h2').forEach(h2 => {
      const h2Text = h2.textContent.trim().replace(/:$/, '');
      const isSourceHeader = h2Text.toLowerCase().includes('source');
      if (isSourceHeader || !h2Text) return;

      let combinedBody = '';
      let next = h2.nextElementSibling;
      while (next && !['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(next.tagName.toLowerCase())) {
        const textBlock = next.textContent.trim().replace(/^[•\-\u2022\u2013\u2014\s\t*]+/, '');
        if (textBlock) {
          combinedBody += (combinedBody ? ' ' : '') + textBlock;
        }
        const toRemove = next;
        next = next.nextElementSibling;
        toRemove.remove();
      }

      const ul = document.createElement('ul');
      ul.style.paddingLeft = '1.5rem';
      ul.style.marginTop = '0.5rem';
      ul.style.marginBottom = '0.5em';
      ul.innerHTML = `<li style="margin-bottom: 0.5em; line-height: 1.5;"><strong>${h2Text}:</strong> ${combinedBody}</li>`;
      h2.replaceWith(ul);
    });

    // Merge consecutive <ul> tags
    mergeConsecutiveUls(doc);

    // Uniformize keys in bullet list
    const NORM_EXEC_TITLE_MAP = {
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

    const normalizeKey = (str) => {
      return str.toLowerCase().replace(/\b(and|&)\b/g, 'and').replace(/[^a-z0-9]/g, '').trim();
    };

    // Some source reports dump every Executive Summary category onto a single bullet
    // instead of one bullet per category (e.g. "Executive Summary: Company Overview:
    // ... Product Overview: ... Business Model: ..."). The rest of this pipeline only
    // ever looks at the FIRST colon in a bullet, so without this the whole blob gets
    // crammed into one bullet and then mislabeled by the auto-title fallback below.
    // Detect blocks with 2+ recognized inline labels and split them apart first.
    const EXEC_LABEL_GROUPS = [
      { title: 'Company Overview', pattern: 'Value Proposition|Company Overview' },
      { title: 'Product Overview', pattern: 'Product Offering|Product Overview' },
      { title: 'Business Model', pattern: 'Business Model' },
      { title: 'Customer Overview', pattern: 'Customer Profiles?|Customer Overview' },
      { title: 'Customer Feedback & Testimonials', pattern: 'Customer Feedback(?:\\s*(?:&|and)\\s*Testimonials)?' },
      { title: 'Competitive Landscape', pattern: 'Competitive Landscape' },
      { title: 'Leadership Team', pattern: 'Leadership(?:\\s*Team)?' },
      { title: 'Sales & Go-To-Market', pattern: 'Sales(?:\\s*(?:&|and)\\s*Go[- ]?to[- ]?Market)?' },
      { title: 'Research & Development', pattern: '(?:Research(?:\\s*(?:&|and)\\s*Development)?|R\\s*&\\s*D)' },
      { title: 'Market Definition', pattern: 'Market(?:\\s*Definition)?' }
    ];
    const execLabelRegex = new RegExp(`(${EXEC_LABEL_GROUPS.map(g => g.pattern).join('|')})\\s*:`, 'gi');

    doc.querySelectorAll('p, li').forEach(el => {
      const text = el.textContent.trim();
      if (!text) return;

      const matches = [];
      execLabelRegex.lastIndex = 0;
      let labelMatch;
      while ((labelMatch = execLabelRegex.exec(text)) !== null) {
        const matchedLabel = labelMatch[1];
        const group = EXEC_LABEL_GROUPS.find(g => new RegExp(`^(?:${g.pattern})$`, 'i').test(matchedLabel));
        if (group) {
          matches.push({ index: labelMatch.index, length: labelMatch[0].length, title: group.title });
        }
      }

      // A single recognized label is the normal case, handled fine by the existing logic below.
      if (matches.length < 2) return;

      const preambleRaw = text.substring(0, matches[0].index).trim();
      const preambleNormalized = preambleRaw.replace(/[:\-–—\s]+$/, '').trim().toLowerCase();
      const isNoisePreamble = !preambleRaw || preambleNormalized === 'executive summary' || preambleRaw.length < 3;

      const segments = [];
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index + matches[i].length;
        const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
        let content = text.substring(start, end).trim();
        if (i === 0 && !isNoisePreamble) {
          content = `${preambleRaw} ${content}`.trim();
        }
        if (content) segments.push({ title: matches[i].title, content });
      }
      if (segments.length < 2) return;

      const newListHtml = `<ul style="padding-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5em;">${segments
        .map(seg => `<li style="margin-bottom: 0.5em; line-height: 1.5;"><strong>${seg.title}:</strong> ${seg.content}</li>`)
        .join('')}</ul>`;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = newListHtml;
      el.replaceWith(...wrapper.childNodes);
    });

    // Preprocess paragraphs starting with bullet
    let currentUl = null;
    doc.querySelectorAll('p, div').forEach(el => {
      const text = el.textContent.trim();
      if (/^[•●▪◦\-\u2022]/.test(text)) {
        const colonIdx = text.indexOf(':');
        let canonicalTitle = '';
        let valueHtml = '';
        
        if (colonIdx > 0 && colonIdx < 60) {
          const beforeText = text.substring(0, colonIdx).replace(/^[•●▪◦\-\u2022]\s*/, '').trim();
          const normKey = normalizeKey(beforeText);
          canonicalTitle = NORM_EXEC_TITLE_MAP[normKey] || beforeText;
          valueHtml = getValueHtml(el);
        } else {
          valueHtml = el.innerHTML.replace(/^(?:<[^>]+>)*\s*[•●▪◦\-\u2022]\s*/, '').trim();
        }

        const li = document.createElement('li');
        li.style.marginBottom = '0.5em';
        li.style.lineHeight = '1.5';
        li.innerHTML = canonicalTitle 
          ? `<strong>${canonicalTitle}:</strong> ${valueHtml.trim()}`
          : valueHtml.trim();

        if (!currentUl) {
          currentUl = document.createElement('ul');
          currentUl.style.paddingLeft = '1.5rem';
          currentUl.style.marginTop = '0.5rem';
          currentUl.style.marginBottom = '0.5em';
          el.before(currentUl);
        }
        currentUl.appendChild(li);
        el.remove();
      } else {
        currentUl = null;
      }
    });

    const parsedLis = [];
    doc.querySelectorAll('li').forEach(li => {
      const text = li.textContent.trim();
      const html = li.innerHTML || '';
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
          contentHtml = getValueHtml(li).trim();
        } else {
          const canonical = STANDARD_EXEC_TITLES.find(t => normalizeKey(t) === normKey);
          if (canonical) {
            hasTitle = true;
            title = canonical;
            contentHtml = getValueHtml(li).trim();
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
      parsedLis.push({ li, hasTitle, title, contentHtml });
    });

    const usedTitles = new Set();
    parsedLis.forEach(item => {
      if (item.hasTitle) usedTitles.add(item.title);
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
        item.li.innerHTML = `<strong>${item.title}:</strong> ${item.contentHtml}`;
      } else {
        item.li.innerHTML = item.contentHtml;
      }
    });

    mergeConsecutiveUls(doc);
  }

  // --- Competitive Landscape specific transform ---
  if (index === 5) {
    doc.querySelectorAll('h2').forEach(h2 => {
      const h2Text = h2.textContent.trim().replace(/:$/, '');
      const isSourceHeader = h2Text.toLowerCase().includes('source');
      if (isSourceHeader || !h2Text) return;

      let combinedBody = '';
      let next = h2.nextElementSibling;
      while (next && !['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(next.tagName.toLowerCase())) {
        combinedBody += (combinedBody ? ' ' : '') + next.textContent.trim();
        const toRemove = next;
        next = next.nextElementSibling;
        toRemove.remove();
      }

      const ul = document.createElement('ul');
      ul.style.paddingLeft = '1.5rem';
      ul.style.marginTop = '0.5rem';
      ul.style.marginBottom = '0.5em';
      ul.innerHTML = `<li style="margin-bottom: 0.5em; line-height: 1.5;"><strong>${h2Text}:</strong> ${combinedBody}</li>`;
      h2.replaceWith(ul);
    });

    mergeConsecutiveUls(doc);
  }

  // --- Consolidated source extraction (Section Specific) ---
  let sectionSources = [];
  const getLinksFromElement = (el) => {
    const links = [];
    let lastIdx = 0;
    const parentText = el.textContent;

    el.querySelectorAll('a').forEach(aEl => {
      const href = aEl.getAttribute('href');
      let linkText = aEl.textContent.trim();
      if (href) {
        const isNakedUrl = /^(?:https?:\/\/|www\.)[^\s]+$/i.test(linkText) || 
                           /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?$/i.test(linkText);
        
        const anchorIndex = parentText.indexOf(linkText, lastIdx);
        if (anchorIndex >= lastIdx) {
          let precedingText = parentText.substring(lastIdx, anchorIndex).trim();
          if (precedingText.includes('\n')) {
            precedingText = precedingText.split('\n').pop().trim();
          }
          if (/:|\u2014|\u2013|(\s-\s)/.test(precedingText) || isNakedUrl) {
            const cleanPublisher = LinkUtils.cleanPublisherText(precedingText);
            if (cleanPublisher && cleanPublisher.length > 2 && cleanPublisher.toLowerCase() !== 'source') {
              linkText = cleanPublisher;
            }
          }
          lastIdx = anchorIndex + aEl.textContent.trim().length;
        }

        let cleanPublisher = LinkUtils.cleanPublisherText(linkText);
        const isStillNaked = /^(?:https?:\/\/|www\.)[^\s]+$/i.test(cleanPublisher) || 
                             /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?$/i.test(cleanPublisher) ||
                             !cleanPublisher ||
                             cleanPublisher.toLowerCase() === 'source' ||
                             cleanPublisher.length > 60;
                             
        if (isStillNaked) {
          const extracted = LinkUtils.extractLinks(parentText);
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

        links.push({ publisher: cleanPublisher, url: href });
      }
    });

    if (links.length > 0) return links;
    return LinkUtils.extractLinks(el.textContent);
  };

  // Walk backward to consolidate sources
  let last = doc.body.lastElementChild;
  while (last) {
    const title = last.textContent.trim().toLowerCase();
    const isSourcesHeader = title === 'sources' || title === 'source' || title === 'sources:' || title === 'source:';
    if (isSourcesHeader) {
      const prev = last.previousElementSibling;
      last.remove();
      last = prev;
      continue;
    }

    const links = getLinksFromElement(last);
    if (links.length > 0 && LinkUtils.isPureSourceBlock(last.textContent.trim(), links)) {
      sectionSources.push(...links);
      const prev = last.previousElementSibling;
      last.remove();
      last = prev;
    } else {
      break;
    }
  }

  // Remove inline source headers
  doc.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, strong, em, b').forEach(el => {
    const title = el.textContent.trim().toLowerCase();
    if (title === 'sources' || title === 'source' || title === 'sources:' || title === 'source:') {
      let current = el.nextElementSibling;
      while (current) {
        const isHeader = current.getAttribute('data-subheader') === 'true' || ['h1', 'h2', 'h3'].includes(current.tagName.toLowerCase());
        if (isHeader) break;
        const links = getLinksFromElement(current);
        if (links.length > 0) {
          sectionSources.push(...links);
          const toRemove = current;
          current = current.nextElementSibling;
          toRemove.remove();
        } else {
          break;
        }
      }
      el.remove();
    }
  });

  sectionSources = deduplicateLinks(sectionSources);

  // Append Consolidated Sources
  if (sectionSources.length > 0) {
    const label = sectionSources.length === 1 ? 'Source' : 'Sources';
    const sourcesH2 = document.createElement('h2');
    sourcesH2.setAttribute('data-subheader', 'true');
    sourcesH2.style.fontWeight = '300';
    sourcesH2.style.marginTop = '1.5em';
    sourcesH2.style.marginBottom = '0.5em';
    sourcesH2.style.fontSize = '1.25em';
    sourcesH2.innerHTML = `<span style="font-weight: 300;">${label}</span>`;

    let listHtml = `<ul style="padding-left: 1.5rem; margin-top: 0.5rem; margin-bottom: 0.5em;">`;
    sectionSources.forEach(link => {
      listHtml += `<li style="margin-bottom: 0.25em;"><a href="${link.url}" style="color: inherit; text-decoration: underline;">${link.publisher}</a></li>`;
    });
    listHtml += '</ul>';

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = listHtml;

    doc.body.appendChild(sourcesH2);
    doc.body.appendChild(tempDiv.firstElementChild);
  }

  // Bold words before colons
  doc.querySelectorAll('li').forEach(li => {
    if (li.querySelectorAll('strong, b, a').length > 0) return;
    const html = li.innerHTML || '';
    const colonIndex = html.indexOf(':');
    if (colonIndex > 0 && colonIndex < 60) {
      const before = html.substring(0, colonIndex);
      const after = html.substring(colonIndex);
      li.innerHTML = `<strong>${before}:</strong>${after.substring(1)}`;
    }
  });

  // Strip heading formatting from any headings that ended up inside a table cell
  // (e.g. a DOCX table cell authored with a Word "Heading" paragraph style, or a
  // subheader match inside a cell). A section-level heading font size looks broken
  // sitting inside a table, so unwrap it back to plain inline text.
  doc.querySelectorAll('table h1, table h2, table h3, table h4, table h5, table h6').forEach(h => {
    h.replaceWith(...h.childNodes);
  });

  // Apply visual styling to Headers
  doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
    el.querySelectorAll('strong, b, em, i').forEach(bold => {
      bold.replaceWith(bold.innerHTML);
    });

    const isMainTitle = !el.getAttribute('data-subheader');
    const fontSize = isMainTitle ? '1.5em' : '1.25em';
    const marginTop = isMainTitle ? '2em' : '1.5em';
    
    el.setAttribute('style', `font-weight: 300; margin-top: ${marginTop}; margin-bottom: 0.5em; font-size: ${fontSize};`);
    
    const inner = el.innerHTML || '';
    if (!inner.includes('<span style="font-weight: 300;"')) {
      el.innerHTML = `<span style="font-weight: 300;">${inner}</span>`;
    }
  });

  // Prepend section title as H2 if not already starting with a heading
  const firstEl = doc.body.firstElementChild;
  const startsWithHeading = firstEl && /^h[1-4]$/i.test(firstEl.tagName);
  if (!startsWithHeading) {
    const titleHeader = document.createElement('h2');
    titleHeader.setAttribute('style', 'font-weight: 300; margin-top: 1.5em; margin-bottom: 0.5em; font-size: 1.5em;');
    titleHeader.innerHTML = `<span style="font-weight: 300;">${TARGET_TITLES[index]}</span>`;
    doc.body.insertBefore(titleHeader, doc.body.firstChild);
  }

  return doc.body.innerHTML;
}

// Helpers
function mergeConsecutiveUls(doc) {
  doc.querySelectorAll('ul + ul').forEach(ul => {
    const prev = ul.previousElementSibling;
    if (prev && prev.tagName.toLowerCase() === 'ul') {
      prev.append(...Array.from(ul.childNodes));
      ul.remove();
    }
  });
}

function getValueHtml(node) {
  let valueHtml = '';
  let foundColon = false;
  
  const childNodes = Array.from(node.childNodes);
  for (let i = 0; i < childNodes.length; i++) {
    const child = childNodes[i];
    if (foundColon) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        valueHtml += child.outerHTML;
      } else if (child.nodeType === Node.TEXT_NODE) {
        valueHtml += child.textContent;
      }
      continue;
    }
    
    const text = child.textContent;
    const colonIdx = text.indexOf(':');
    if (colonIdx !== -1) {
      foundColon = true;
      if (child.nodeType === Node.TEXT_NODE) {
        valueHtml += text.substring(colonIdx + 1);
      } else {
        const afterText = text.substring(colonIdx + 1).trim();
        if (afterText.length > 0) {
          const innerValue = getValueHtml(child);
          const tagName = child.tagName.toLowerCase();
          const attribs = Array.from(child.attributes)
            .map(attr => ` ${attr.name}="${attr.value}"`)
            .join('');
          valueHtml += `<${tagName}${attribs}>${innerValue}</${tagName}>`;
        }
      }
    }
  }
  return valueHtml;
}

function deduplicateLinks(links) {
  const seen = new Set();
  return links.filter(l => {
    const uniqueKey = `${l.url}-${l.publisher}`;
    if (seen.has(uniqueKey)) return false;
    seen.add(uniqueKey);
    return true;
  });
}

function cleanHtmlForEditor(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  doc.body.querySelectorAll('*').forEach(node => {
    node.removeAttribute('style');
    node.removeAttribute('border');
    node.removeAttribute('cellpadding');
    node.removeAttribute('cellspacing');
  });
  return doc.body.innerHTML;
}

function convertHtmlToPlainText(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.innerText || temp.textContent || '';
}

// --- Query active page fields from content.js ---
function scanPageFields(opts = {}) {
  const silent = opts.silent === true;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab) return;

    chrome.tabs.sendMessage(activeTab.id, { action: 'scanFields' }, (response) => {
      if (chrome.runtime.lastError) {
        // Auto-triggered rescans fail quietly for ordinary tabs (chrome:// pages, a tab
        // still mid-navigation, etc.) - only the manual "Re-scan Fields" click should
        // surface that as an error.
        if (!silent) {
          console.error(chrome.runtime.lastError);
          showStatus('Webpage fields could not be scanned. Please navigate to a page containing input fields and reload the page.', 'error');
        }
        return;
      }

      if (response && response.fields) {
        pageFields = response.fields;
        renderMappingUI();
      } else if (!silent) {
        showStatus('No editable fields found on the page.', 'error');
      }
    });
  });
}

// --- Render Matchings UI with Smart Heuristics ---
function renderMappingUI() {
  mappingList.innerHTML = '';
  mappingSectionHasData = true;
  mappingSection.style.display = 'block';

  parsedSections.forEach((section, index) => {
    const row = document.createElement('div');
    row.className = 'mapping-row';

    const sourceLabel = document.createElement('div');
    sourceLabel.className = 'source-label';
    sourceLabel.textContent = `${index + 1}. ${section.title}`;
    sourceLabel.title = section.title;

    const arrow = document.createElement('div');
    arrow.className = 'mapping-arrow';
    arrow.innerHTML = '➔';

    const select = document.createElement('select');
    select.className = 'target-select';
    select.setAttribute('data-section-id', section.id);

    // Default "None" option
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '[ Skip Section ]';
    select.appendChild(defaultOpt);

    // Populate dropdown options with page fields
    pageFields.forEach(field => {
      const opt = document.createElement('option');
      opt.value = field.id;
      opt.textContent = `${field.label} (${field.tagName}${field.isContentEditable ? ' + rich editor' : ''})`;
      select.appendChild(opt);
    });

    // Smart Match Heuristics
    const matchedField = findBestFieldMatch(section.title, pageFields);
    if (matchedField) {
      select.value = matchedField.id;
    }

    // Lets a single mis-mapped or mis-pasted section be overwritten on its own,
    // without re-running the full batch and touching sections that already look right.
    const pasteOneBtn = document.createElement('button');
    pasteOneBtn.type = 'button';
    pasteOneBtn.className = 'paste-one-btn';
    pasteOneBtn.title = `Paste only "${section.title}" (overwrite this field)`;
    pasteOneBtn.innerHTML = '<svg stroke="currentColor" fill="none" stroke-width="2.5" viewBox="0 0 24 24" width="12" height="12"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';
    pasteOneBtn.addEventListener('click', () => pasteSingleSection(section.id, pasteOneBtn));

    row.appendChild(sourceLabel);
    row.appendChild(arrow);
    row.appendChild(select);
    row.appendChild(pasteOneBtn);
    mappingList.appendChild(row);
  });

  autoPasteBtn.disabled = false;
}

/**
 * Smart matching heuristic mapping section titles to page input labels
 */
function findBestFieldMatch(sectionTitle, fields) {
  const normTitle = sectionTitle.toLowerCase();
  
  // Specific keywords to look for based on section
  let keywords = [];
  if (normTitle.includes("executive")) keywords = ["executive", "summary"];
  else if (normTitle.includes("value proposition")) keywords = ["value", "proposition", "offering", "business", "model"];
  else if (normTitle.includes("foundation")) keywords = ["foundation", "ownership", "milestone", "history"];
  else if (normTitle.includes("profile")) keywords = ["profile", "customer", "target"];
  else if (normTitle.includes("feedback")) keywords = ["feedback", "testimonial", "satisfaction", "roi"];
  else if (normTitle.includes("competitive")) keywords = ["competitive", "landscape", "competitor", "competition"];
  else if (normTitle.includes("leadership")) keywords = ["leadership", "management", "team", "founder"];
  else if (normTitle.includes("sales")) keywords = ["sales", "gtm", "go-to-market", "channel"];
  else if (normTitle.includes("development")) keywords = ["development", "r&d", "tech", "capability", "rd"];
  else if (normTitle.includes("market")) keywords = ["market", "trend", "characteristics"];

  let bestField = null;
  let highestScore = 0;

  fields.forEach(field => {
    const fieldLabel = (field.label || '').toLowerCase();
    const fieldPlaceholder = (field.placeholder || '').toLowerCase();
    
    let score = 0;
    
    // Direct matches
    if (fieldLabel.includes(normTitle)) {
      score += 10;
    }
    
    // Keyword matches
    keywords.forEach(kw => {
      if (fieldLabel.includes(kw)) score += 3;
      if (fieldPlaceholder.includes(kw)) score += 1;
    });

    if (score > highestScore && score >= 2) {
      highestScore = score;
      bestField = field;
    }
  });

  return bestField;
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
  });
}

/**
 * Pastes a single section's content into one page field. Tries the main-world editor
 * APIs first (CKEditor/Quill/ProseMirror - keeps the framework's own state in sync),
 * then falls back to the clipboard + synthetic-paste content-script path. Shared by the
 * "Automate Pasting" batch loop and the single-section overwrite button so both stay
 * in sync with any future paste-strategy changes.
 */
async function pasteSectionToTab(tabId, section, fieldId) {
  // 1. Try to set editor content directly via main-world scripting (bypasses Content Security Policy)
  let apiSuccess = false;
  const cleanHtml = cleanHtmlForEditor(section.html);

  try {
    const scriptResults = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (fId, htmlContent) => {
        const el = document.querySelector(`[data-hyperlinks-id="${fId}"]`);
        if (!el) return false;

        // Restores focus + cursor to the end of the field and clears any leftover
        // readonly/disabled state, so the editor doesn't look inert/locked afterward
        // even though its internal model was updated correctly via its own API.
        const finishEditable = () => {
          try {
            if (el.getAttribute('contenteditable') === 'false') {
              el.setAttribute('contenteditable', 'true');
            }
            el.removeAttribute('aria-disabled');
            el.focus();
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
          } catch (e) {
            // Best-effort only - never let this affect the paste's success result.
          }
        };

        try {
          // 1. Try CKEditor 5
          if (el.ckeditorInstance) {
            el.ckeditorInstance.setData(htmlContent);
            if (el.ckeditorInstance.isReadOnly) {
              console.warn('Hyperlinks: CKEditor instance is in read-only mode; content set but not editable until the page lifts it.');
            }
            finishEditable();
            console.log('Hyperlinks: Pasted via CKEditor 5 API (executeScript)');
            return true;
          }
          // 2. Try Quill
          const quill = (window.Quill && window.Quill.find) ? window.Quill.find(el) : el.__quill;
          if (quill) {
            quill.clipboard.dangerouslyPasteHTML(htmlContent);
            quill.enable(true);
            quill.setSelection(quill.getLength(), 0);
            finishEditable();
            console.log('Hyperlinks: Pasted via Quill API (executeScript)');
            return true;
          }
          // 3. Try ProseMirror / TipTap
          if (el.pmView) {
            const view = el.pmView;
            const parser = new DOMParser();
            const docObj = parser.parseFromString(htmlContent, 'text/html');
            const slice = view.someProp('clipboardParser')
              ? view.someProp('clipboardParser').parse(docObj.body)
              : null;

            if (slice) {
              const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, slice.content);
              view.dispatch(tr);
              finishEditable();
              console.log('Hyperlinks: Pasted via ProseMirror API (executeScript)');
              return true;
            }
          }
        } catch (err) {
          console.error('Hyperlinks: Main-world script execution error:', err);
        }
        return false;
      },
      args: [fieldId, cleanHtml]
    });

    if (scriptResults && scriptResults[0] && scriptResults[0].result) {
      apiSuccess = true;
    }
  } catch (err) {
    console.error('Failed to run executeScript in main world:', err);
  }

  if (apiSuccess) return true;

  // 2. Fallback to Clipboard API + Content Script Paste message
  try {
    const htmlBlob = new Blob([section.html], { type: 'text/html' });
    const textBlob = new Blob([section.plainText], { type: 'text/plain' });
    const clipboardItem = new ClipboardItem({
      'text/html': htmlBlob,
      'text/plain': textBlob
    });
    await navigator.clipboard.write([clipboardItem]);
  } catch (err) {
    console.error('Failed to write section to clipboard in popup:', err);
  }

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      {
        action: 'pasteCurrentClipboard',
        fieldId: fieldId,
        htmlContent: section.html,
        plainText: section.plainText
      },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve(false);
        } else {
          resolve(response && response.success);
        }
      }
    );
  });
}

// --- Execute Injection Loop ---
async function executeAutoPasting() {
  autoPasteBtn.disabled = true;
  showStatus('Pasting sections into page...', 'info');

  const activeTab = await getActiveTab();
  if (!activeTab) {
    showStatus('No active tab found.', 'error');
    autoPasteBtn.disabled = false;
    return;
  }

  const selects = document.querySelectorAll('.target-select');
  let pastedCount = 0;
  let failCount = 0;

  for (const select of selects) {
    const sectionId = parseInt(select.getAttribute('data-section-id'));
    const fieldId = select.value;
    if (!fieldId) continue; // Skip if mapped to "Skip"

    const section = parsedSections.find(s => s.id === sectionId);
    if (!section) continue;

    const result = await pasteSectionToTab(activeTab.id, section, fieldId);
    if (result) pastedCount++;
    else failCount++;

    // Wait 150ms to allow the editor state to update before moving to the next section
    await new Promise(r => setTimeout(r, 150));
  }

  if (pastedCount > 0) {
    showStatus(`Successfully automated pasting of ${pastedCount} sections!${failCount > 0 ? ` (${failCount} failed)` : ''}`, 'success');
  } else {
    showStatus('No sections were pasted. Please verify your mappings.', 'error');
  }
  autoPasteBtn.disabled = false;
}

/**
 * Re-pastes a single mapped section, overwriting just that one field. Useful for fixing
 * a mis-mapped or mis-pasted section without re-running the full batch and touching
 * sections that already look right.
 */
async function pasteSingleSection(sectionId, buttonEl) {
  const select = document.querySelector(`.target-select[data-section-id="${sectionId}"]`);
  const fieldId = select ? select.value : '';
  const section = parsedSections.find(s => s.id === sectionId);
  if (!section) return;

  if (!fieldId) {
    showStatus(`Select a target field for "${section.title}" first.`, 'error');
    return;
  }

  if (buttonEl) buttonEl.disabled = true;
  showStatus(`Re-pasting "${section.title}"...`, 'info');

  const activeTab = await getActiveTab();
  if (!activeTab) {
    showStatus('No active tab found.', 'error');
    if (buttonEl) buttonEl.disabled = false;
    return;
  }

  const result = await pasteSectionToTab(activeTab.id, section, fieldId);

  if (result) {
    showStatus(`"${section.title}" overwritten successfully!`, 'success');
  } else {
    showStatus(`Failed to paste "${section.title}". Try again or paste manually.`, 'error');
  }
  if (buttonEl) buttonEl.disabled = false;
}

// ============================================================================
// Audit Compare tab: loads an audit report (.docx/.txt), extracts the
// "Rebuilt Metadata Tag Set (post-audit)" section, and renders it as a
// read-only reference list so it can be read side-by-side with Airtable while
// values are entered manually. This tab never writes to the page - it's a
// compare/reference tool only, not an auto-fill tool.
// ============================================================================

spDropzone.addEventListener('click', () => spFileInput.click());
spDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  spDropzone.classList.add('dragover');
});
spDropzone.addEventListener('dragleave', () => {
  spDropzone.classList.remove('dragover');
});
spDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  spDropzone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleAuditReportFile(file);
});
spFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleAuditReportFile(file);
});

spClearBtn.addEventListener('click', () => {
  chrome.storage.local.remove('lastAuditCompare');
  spCompareList.innerHTML = '';
  spToolbar.style.display = 'none';
  spSearch.value = '';
  spFileInput.value = '';
  statusContainer.innerHTML = '';
});

spSearch.addEventListener('input', () => {
  const q = spSearch.value.trim().toLowerCase();
  document.querySelectorAll('.compare-row').forEach(row => {
    const match = !q || row.getAttribute('data-search').includes(q);
    row.style.display = match ? '' : 'none';
  });
  document.querySelectorAll('.compare-group').forEach(group => {
    const anyVisible = Array.from(group.querySelectorAll('.compare-row')).some(r => r.style.display !== 'none');
    group.style.display = anyVisible ? '' : 'none';
  });
});

// Restore the last loaded report, since the panel can be closed/reopened across sessions.
chrome.storage.local.get('lastAuditCompare', (data) => {
  if (data && data.lastAuditCompare && data.lastAuditCompare.groups) {
    renderCompareGroups(data.lastAuditCompare.groups);
    showStatus(`Restored "${data.lastAuditCompare.fileName}" from your last session.`, 'info');
  }
});

async function handleAuditReportFile(file) {
  const fileName = file.name.toLowerCase();
  showStatus('Parsing audit report...', 'info');
  setCompanyBanner(file.name);

  try {
    if (fileName.endsWith('.docx')) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      processAuditReportHtml(result.value, file.name);
    } else if (fileName.endsWith('.txt')) {
      const text = await file.text();
      const htmlLines = text.split('\n').map(line => `<p>${escapeHtmlForCompare(line)}</p>`).join('');
      processAuditReportHtml(htmlLines, file.name);
    } else {
      showStatus('Unsupported file format. Please upload a .docx or .txt file.', 'error');
    }
  } catch (err) {
    console.error(err);
    showStatus('Failed to parse file: ' + err.message, 'error');
  }
}

function processAuditReportHtml(html, fileName) {
  const groups = parseAuditTagSet(html);
  if (!groups || groups.every(g => g.fields.length === 0)) {
    showStatus('Could not find a "Rebuilt Metadata Tag Set" section in this document.', 'error');
    return;
  }
  renderCompareGroups(groups);
  const fieldCount = groups.reduce((sum, g) => sum + g.fields.length, 0);
  showStatus(`Loaded "${fileName}" - ${fieldCount} fields ready to compare.`, 'success');
  chrome.storage.local.set({ lastAuditCompare: { groups, fileName, ts: Date.now() } });
}

/**
 * Locates the "Rebuilt Metadata Tag Set" (post-audit) section of the report and parses its
 * bullet lines ("Label: Value · Value") into grouped field rows. Deliberately ignores the
 * earlier "Extracted Metadata Tag Set" and "Table 1B" sections in the same document - only
 * the corrected, post-audit values are meant to be compared against Airtable. Stops at the
 * next numbered top-level section heading (e.g. "5. Source & Hyperlink Registry").
 */
function parseAuditTagSet(htmlContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  const allEls = Array.from(doc.body.querySelectorAll('*'));
  const startEl = allEls.find(el => {
    const text = el.textContent.trim();
    return /rebuilt metadata tag set/i.test(text) && text.length < 100;
  });

  if (!startEl) return null;

  // Walk up to the element's top-level position directly under <body>, since headings can
  // be wrapped in nested spans/strongs depending on how the docx was authored.
  let topAncestor = startEl;
  while (topAncestor.parentElement && topAncestor.parentElement !== doc.body) {
    topAncestor = topAncestor.parentElement;
  }

  const groups = [];
  let currentGroup = null;

  function processFieldValue(label, rawValueIn) {
    let rawValue = rawValueIn.trim();

    let note = null;
    let flagged = false;

    // Trailing "[HUMAN REVIEW: ...]" / "[omit - ...]" style annotations
    const bracketMatch = /\[([^\]]+)\]\s*$/.exec(rawValue);
    if (bracketMatch) {
      note = bracketMatch[1].trim();
      rawValue = rawValue.slice(0, bracketMatch.index).trim();
      flagged = true;
    }

    // "— omit (reason)" / "-- omit (reason)" style annotations (used in table-form tag sets)
    const omitMatch = /^[—\-–]+\s*omit\s*(?:\(([^)]*)\))?\s*$/i.exec(rawValue);
    if (omitMatch) {
      note = omitMatch[1] ? omitMatch[1].trim() : 'omit';
      flagged = true;
      rawValue = '';
    }

    // "FLAG: ..." leading annotations
    const flagMatch = /^FLAG:\s*(.*)$/i.exec(rawValue);
    if (flagMatch) {
      note = flagMatch[1].trim();
      flagged = true;
      rawValue = '';
    }

    if (!rawValue || /^n\/a$/i.test(rawValue)) {
      flagged = true;
      if (!note) note = 'no value provided';
      rawValue = '';
    }

    const values = rawValue
      ? rawValue.split('·').map(v => v.trim()).filter(Boolean)
      : [];

    if (!currentGroup) {
      currentGroup = { title: 'General', fields: [] };
      groups.push(currentGroup);
    }
    currentGroup.fields.push({ label, values, note, flagged });
  }

  function processFieldLine(lineText) {
    const cleaned = lineText.replace(/^[•●◦▪\-]\s*/, '');
    const match = /^(.+?):\s*(.*)$/s.exec(cleaned);
    if (!match) return;

    processFieldValue(match[1].trim(), match[2]);
  }

  // "Field | Value" table rows, as used when the tag set is authored as a table instead of
  // a bullet list. The header row (Field/Value) is skipped so it doesn't become a fake field.
  function processTableRow(row) {
    const cells = Array.from(row.querySelectorAll('td, th'));
    if (cells.length === 0) return;

    // A merged, single-cell row acts as a section divider within the table - the table
    // equivalent of the short standalone heading lines that start a new group between
    // bullet-list items. Same grouping behavior, just inside a table instead of a list.
    if (cells.length === 1) {
      const headingText = cells[0].textContent.trim();
      if (headingText) {
        currentGroup = { title: headingText, fields: [] };
        groups.push(currentGroup);
      }
      return;
    }

    const label = cells[0].textContent.trim();
    const rawValue = cells[1].textContent.trim();
    if (!label) return;
    if (/^field$/i.test(label) && /^value$/i.test(rawValue)) return; // header row

    // A two-cell row with a completely blank value cell is also a section divider, not a
    // real field - Word tables commonly render a merged heading cell as <td>Heading</td>
    // followed by an empty <td></td> rather than an actual colspan. Genuine "no value"
    // fields always carry placeholder text (e.g. "— omit (not found)"), so a truly empty
    // cell is a safe signal this is a heading row, not data.
    if (!rawValue) {
      currentGroup = { title: label, fields: [] };
      groups.push(currentGroup);
      return;
    }

    processFieldValue(label, rawValue);
  }

  let node = topAncestor.nextElementSibling;
  while (node) {
    const text = node.textContent.trim();

    // Stop at the next numbered top-level section (e.g. "5. Source & Hyperlink Registry")
    if (/^\d+\.\s/.test(text)) break;

    const tag = node.tagName.toLowerCase();

    if (tag === 'table') {
      Array.from(node.querySelectorAll('tr')).forEach(processTableRow);
    } else if (tag === 'ul' || tag === 'ol') {
      Array.from(node.children).forEach(li => processFieldLine(li.textContent.trim()));
    } else if (tag === 'li') {
      processFieldLine(text);
    } else if (text.includes(':')) {
      processFieldLine(text);
    } else if (text.length > 0 && text.length < 60) {
      currentGroup = { title: text, fields: [] };
      groups.push(currentGroup);
    }

    node = node.nextElementSibling;
  }

  return groups;
}

function renderCompareGroups(groups) {
  spCompareList.innerHTML = '';
  spToolbar.style.display = 'flex';

  const nonEmptyGroups = groups.filter(g => g.fields.length > 0);
  if (nonEmptyGroups.length === 0) {
    spCompareList.innerHTML = '<p class="empty-hint">No fields found under the "Rebuilt Metadata Tag Set" section.</p>';
    return;
  }

  nonEmptyGroups.forEach(group => {
    const groupEl = document.createElement('div');
    groupEl.className = 'compare-group';

    const titleEl = document.createElement('h3');
    titleEl.className = 'compare-group-title';
    titleEl.textContent = group.title;
    groupEl.appendChild(titleEl);

    group.fields.forEach(field => {
      const row = document.createElement('div');
      row.className = 'compare-row' + (field.flagged ? ' flagged' : '');
      row.setAttribute('data-search', field.label.toLowerCase());

      const labelEl = document.createElement('div');
      labelEl.className = 'compare-label';
      labelEl.textContent = field.label;

      const valueEl = document.createElement('div');
      valueEl.className = 'compare-value';

      if (field.values.length > 0) {
        field.values.forEach(v => {
          const chip = document.createElement('span');
          chip.className = 'value-chip';
          chip.textContent = v;
          valueEl.appendChild(chip);
        });
      } else {
        const empty = document.createElement('span');
        empty.className = 'value-empty';
        empty.textContent = 'No value';
        valueEl.appendChild(empty);
      }

      if (field.note) {
        const noteEl = document.createElement('span');
        noteEl.className = 'value-note';
        noteEl.textContent = `⚠ ${field.note}`;
        valueEl.appendChild(noteEl);
      }

      const copyBtn = document.createElement('button');
      copyBtn.className = 'compare-copy-btn';
      copyBtn.title = 'Copy value';
      copyBtn.textContent = '⧉';
      copyBtn.disabled = field.values.length === 0;
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // don't also trigger the row's jump-to-report click below
        navigator.clipboard.writeText(field.values.join(', ')).then(() => {
          copyBtn.classList.add('copied');
          setTimeout(() => copyBtn.classList.remove('copied'), 800);
        });
      });

      row.appendChild(labelEl);
      row.appendChild(valueEl);
      row.appendChild(copyBtn);

      // Report-lookup wiring: only these specific fields get a click-to-fetch action, per
      // what was asked - everything else stays a plain reference row. Matched purely by the
      // field's own label text (not by which group/heading it happened to fall under) so
      // this keeps working the same whether the tag set was authored as bullets or as a
      // table - a table-form doc often has no literal "Introduction"/"Competitive
      // Landscape" divider row at all.
      // sectionHeader can be a single header name or an array of alternate names to try
      // in order (e.g. a section that goes by a couple of different titles).
      const normLabel = field.label.trim().toLowerCase();
      let sectionHeader = null;

      if (
        normLabel.includes('hq country') ||
        normLabel.includes('hq city') ||
        normLabel.includes('year founded')
      ) {
        sectionHeader = 'Founding Details & Initial Focus';
      } else if (
        (normLabel.includes('g2') && normLabel.includes('rating')) ||
        (normLabel.includes('capterra') && normLabel.includes('rating'))
      ) {
        sectionHeader = 'Customer Level of Satisfaction';
      } else if (normLabel.includes('platform')) {
        sectionHeader = 'Platform Competition';
      } else if (normLabel.includes('adjacent')) {
        sectionHeader = 'Adjacent Competition';
      } else if (normLabel.includes('point')) {
        sectionHeader = ['Point Solution Competition', 'Point Solutions Competition', 'Direct Competition'];
      } else if (normLabel.includes('competit')) {
        // Fallback for any other competitor/competition-named field
        sectionHeader = ['Competitive Landscape'];
      }

      if (sectionHeader) {
        row.classList.add('jumpable');
        row.title = "Click to fetch this section's content from the open report";
        row.addEventListener('click', () => {
          fetchReportSection(sectionHeader, row);
        });
      }

      groupEl.appendChild(row);

      // Special case: a dedicated "browse possible verified customers" action under the
      // Number of Customers field, since it isn't a simple click-the-row lookup - it's an
      // extra affordance, not baked into the row itself.
      if (normLabel === 'number of customers') {
        const browseWrap = document.createElement('div');
        browseWrap.className = 'compare-browse-wrap';

        const browseBtn = document.createElement('button');
        browseBtn.type = 'button';
        browseBtn.className = 'compare-browse-btn';
        browseBtn.textContent = 'Browse possible verified customers';
        browseBtn.addEventListener('click', () => {
          fetchReportSection(['Customer Overview', 'Customers Overview'], browseWrap);
        });

        browseWrap.appendChild(browseBtn);
        groupEl.appendChild(browseWrap);
      }
    });

    spCompareList.appendChild(groupEl);
  });
}

// --- Report lookup: reaches into the open Dedale editor tab (editor.dedale.com) in the
// background and reads back what's listed under a given section, without ever switching
// focus to that tab. Results and errors render inline right under the row/button that was
// clicked. If the section isn't found on the first try, the tab is silently reloaded (still
// without stealing focus) and the lookup is retried once, in case its content was stale or
// hadn't finished rendering yet. ---
const DEDALE_EDITOR_URL_PATTERN = 'https://editor.dedale.com/*';

function findDedaleEditorTab(callback) {
  chrome.tabs.query({ url: DEDALE_EDITOR_URL_PATTERN }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      callback(null);
      return;
    }
    // Multiple report tabs can legitimately be open at once (different companies) - use
    // whichever was looked at most recently rather than an arbitrary one, so this doesn't
    // silently pull data from the wrong company's report.
    const sorted = tabs.slice().sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    callback(sorted[0]);
  });
}

// Once a tab has returned a section successfully, it's proven to be fully loaded and
// responsive - there's no reason to reload it again just because a later lookup (even a
// different section) is requested. Reloading stays reserved for a tab's very first lookup,
// in case the SPA hadn't finished rendering yet.
const warmDedaleTabs = new Set();

// Cache of already-fetched sections per tab, so re-clicking the same field (or a different
// field that maps to the same header) shows the previous result instantly - no messaging or
// reload at all.
const reportSectionCache = new Map();
function sectionCacheKey(tabId, candidates) {
  return `${tabId}::${candidates.join('|').trim().toLowerCase()}`;
}

function clearDedaleTabState(tabId) {
  warmDedaleTabs.delete(tabId);
  for (const key of Array.from(reportSectionCache.keys())) {
    if (key.startsWith(`${tabId}::`)) reportSectionCache.delete(key);
  }
}

// Cached data (and "warm" status) is only valid for as long as the tab stays on the same
// report - drop it once the tab closes or navigates somewhere else.
chrome.tabs.onRemoved.addListener((tabId) => clearDedaleTabState(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) clearDedaleTabState(tabId);
});

function fetchReportSection(headerNames, anchorEl) {
  const candidates = Array.isArray(headerNames) ? headerNames : [headerNames];
  const displayLabel = candidates[0];

  findDedaleEditorTab((tab) => {
    if (!tab) {
      showInlineResult(anchorEl, { type: 'error', message: '⚠ Open the report at editor.dedale.com first.' });
      return;
    }

    const cached = reportSectionCache.get(sectionCacheKey(tab.id, candidates));
    if (cached) {
      showInlineResult(anchorEl, { type: 'success', message: `Found under "${cached.matchedHeader}" in the report:`, items: cached.items });
      return;
    }

    attemptFetchSection(tab.id, candidates, displayLabel, anchorEl, false);
  });
}

function attemptFetchSection(tabId, candidates, displayLabel, anchorEl, alreadyRetried) {
  chrome.tabs.sendMessage(tabId, { action: 'fetchSectionContent', headerCandidates: candidates }, (response) => {
    if (chrome.runtime.lastError || !response || !response.success) {
      // Skip the reload if this tab already proved itself by returning data before - a miss
      // now means the section genuinely isn't there, not that the page needs refreshing.
      if (!alreadyRetried && !warmDedaleTabs.has(tabId)) {
        showInlineResult(anchorEl, { type: 'info', message: 'Not found yet - refreshing the report and retrying...' });
        silentlyReloadAndWait(tabId, () => {
          attemptFetchSection(tabId, candidates, displayLabel, anchorEl, true);
        });
        return;
      }
      const suffix = alreadyRetried ? ', even after refreshing it.' : '.';
      showInlineResult(anchorEl, { type: 'error', message: `⚠ Could not find "${displayLabel}" in the report${suffix}` });
      return;
    }

    warmDedaleTabs.add(tabId);
    const matchedName = response.matchedHeader || displayLabel;
    reportSectionCache.set(sectionCacheKey(tabId, candidates), { items: response.items || [], matchedHeader: matchedName });
    showInlineResult(anchorEl, { type: 'success', message: `Found under "${matchedName}" in the report:`, items: response.items || [] });
  });
}

/**
 * Reloads the report tab in the background (never switches to it or steals focus) and
 * waits for it to finish loading before continuing.
 */
function silentlyReloadAndWait(tabId, callback) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    chrome.tabs.onUpdated.removeListener(listener);
    setTimeout(callback, 600); // let the SPA's own client-side render settle after load
  };

  const listener = (updatedTabId, changeInfo) => {
    if (updatedTabId === tabId && changeInfo.status === 'complete') finish();
  };

  chrome.tabs.onUpdated.addListener(listener);
  chrome.tabs.reload(tabId);

  setTimeout(finish, 8000); // safety net in case 'complete' never fires
}

/**
 * Renders a result (success or error) directly below the row/button that triggered a
 * report lookup, replacing any previous result in that same spot.
 */
function showInlineResult(anchorEl, { type, message, items } = {}) {
  const next = anchorEl.nextElementSibling;
  if (next && next.classList && next.classList.contains('compare-extracted')) {
    next.remove();
  }

  const block = document.createElement('div');
  block.className = 'compare-extracted' + (type === 'error' ? ' error' : type === 'success' ? ' success' : '');

  if (message) {
    const title = document.createElement('div');
    title.className = 'compare-extracted-title';
    title.textContent = message;
    block.appendChild(title);
  }

  if (items) {
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'compare-extracted-empty';
      empty.textContent = 'No content found under that header.';
      block.appendChild(empty);
    } else {
      const ul = document.createElement('ul');
      items.forEach(text => {
        const li = document.createElement('li');
        li.textContent = text;
        ul.appendChild(li);
      });
      block.appendChild(ul);
    }
  }

  anchorEl.insertAdjacentElement('afterend', block);
}

function escapeHtmlForCompare(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
