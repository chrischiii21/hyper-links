/**
 * Chrome Extension Content Script
 * Scans the page for editable elements and handles programmatically pasting content.
 */

// Guards against registering a second onMessage listener if this script somehow gets
// injected into the same page more than once (observed during dev-mode extension
// reloads without a full tab close/reopen) - a stale extra listener from an older version
// of this file can otherwise win the race to respond before the current code even runs.
if (!window.__hyperlinksContentScriptLoaded) {
window.__hyperlinksContentScriptLoaded = true;

// Global index counter for unique field identification
let fieldCounter = 0;

// Listen for messages from the extension popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scanFields') {
    const fields = scanForEditableFields();
    sendResponse({ fields });
  } else if (request.action === 'pasteToField') {
    const { fieldId, htmlContent, plainText } = request;
    const success = pasteIntoElement(fieldId, htmlContent, plainText);
    sendResponse({ success });
  } else if (request.action === 'pasteCurrentClipboard') {
    const { fieldId, htmlContent, plainText } = request;
    pasteFromClipboard(fieldId, htmlContent, plainText).then(success => {
      sendResponse({ success });
    });
    return true; // Keep message channel open for async response
  } else if (request.action === 'fetchSectionContent') {
    fetchSectionContent(request.headerCandidates, sendResponse);
  }
  return true; // Keep message channel open for async response
});

/**
 * Finds a heading-like element on the page whose text matches the given header text
 * (e.g. "Founding Details & Initial Focus"). This extension's own report-pasting logic
 * renders section subheaders as real <h2> elements, but the same phrase (e.g. "Customer
 * Overview", "Competitive Landscape") can ALSO appear as a bolded bullet label inside the
 * Executive Summary section. So real <h2> tags are checked first and exclusively for
 * several passes before any other heading level is considered - a leaf/paragraph fallback
 * is deliberately NOT used anymore, since that's what previously caused a click meant for
 * the true section heading to land on an unrelated Executive Summary bullet instead.
 *
 * Matching is fuzzy (exact -> substring -> bag-of-words) because the live page's heading
 * text may carry numbering prefixes ("III. Founding Details & Initial Focus"), different
 * punctuation ("and" vs "&"), or extra trailing text.
 */
function normalizeHeaderText(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Like document.querySelectorAll(selector), but also descends into open shadow roots.
 * Some component libraries render their UI inside a shadow root for style encapsulation,
 * which a plain querySelectorAll from the main document cannot see into at all - this is
 * required for those pages, and is a strict superset (identical results) on pages that
 * don't use shadow DOM at all.
 */
function queryAllDeep(selector, root) {
  const scopeRoot = root || document;
  const results = [];

  const walk = (node) => {
    if (!node || !node.children) return;
    for (const child of node.children) {
      if (child.matches && child.matches(selector)) results.push(child);
      if (child.shadowRoot) walk(child.shadowRoot);
      walk(child);
    }
  };

  walk(scopeRoot);
  return results;
}

function headerWordsOf(str) {
  return normalizeHeaderText(str).split(' ').filter(Boolean);
}

function bestBagOfWordsMatch(els, targetWords) {
  let best = null;
  let bestExtraWords = Infinity;
  for (const el of els) {
    const text = el.textContent.trim();
    if (text.length === 0 || text.length > 150) continue;
    const words = headerWordsOf(text);
    const hasAll = targetWords.every(w => words.includes(w));
    if (hasAll && words.length - targetWords.length < bestExtraWords) {
      best = el;
      bestExtraWords = words.length - targetWords.length;
    }
  }
  return best;
}

function findHeaderElement(headerText) {
  const targetWords = headerWordsOf(headerText);
  if (targetWords.length === 0) return null;
  const targetNorm = targetWords.join(' ');

  const h2Els = queryAllDeep('h2');
  const otherHeadingEls = queryAllDeep('h1, h3, h4, h5, h6, [role="heading"]');

  // Passes 1-2: exact match, h2 first
  for (const el of h2Els) {
    if (normalizeHeaderText(el.textContent) === targetNorm) return el;
  }
  for (const el of otherHeadingEls) {
    if (normalizeHeaderText(el.textContent) === targetNorm) return el;
  }

  // Passes 3-4: full phrase contained (numbering prefixes/suffixes), h2 first
  for (const el of h2Els) {
    const text = el.textContent.trim();
    if (text.length > 0 && text.length < 150 && normalizeHeaderText(text).includes(targetNorm)) return el;
  }
  for (const el of otherHeadingEls) {
    const text = el.textContent.trim();
    if (text.length > 0 && text.length < 150 && normalizeHeaderText(text).includes(targetNorm)) return el;
  }

  // Passes 5-6: bag-of-words closest fit, h2 first, other heading levels as last resort
  const h2Match = bestBagOfWordsMatch(h2Els, targetWords);
  if (h2Match) return h2Match;
  const otherMatch = bestBagOfWordsMatch(otherHeadingEls, targetWords);
  if (otherMatch) return otherMatch;

  return null;
}

/**
 * Collects the text of whatever sits between a header and the next heading-like element -
 * list items if there's a list, otherwise each block's own text. Used to read back
 * "what's listed under this section" (e.g. verified customers, competitor names) into the
 * side panel without the user needing to eyeball the report themselves.
 */
function extractItemsAfterHeader(headerEl) {
  let block = headerEl;
  while (block.parentElement && block.parentElement.tagName !== 'BODY' && block.parentElement.children.length === 1) {
    block = block.parentElement;
  }

  const isHeadingLike = (el) => /^h[1-6]$/i.test(el.tagName) || el.getAttribute('role') === 'heading';

  const items = [];
  let node = block.nextElementSibling;
  let guard = 0;
  while (node && !isHeadingLike(node) && guard < 200) {
    guard++;
    const listItems = node.querySelectorAll ? Array.from(node.querySelectorAll('li')) : [];
    if (listItems.length > 0) {
      listItems.forEach(li => {
        const text = li.textContent.trim();
        if (text) items.push(text);
      });
    } else {
      const text = node.textContent ? node.textContent.trim() : '';
      if (text) items.push(text);
    }
    node = node.nextElementSibling;
  }

  return items;
}

// "Platform Competition" / "Adjacent Competition" / "Point Solution(s) Competition" /
// "Direct Competition" render as inline bold labels inside a bullet or paragraph under the
// "Competitive Landscape" heading, not as their own headings - findHeaderElement deliberately
// won't match them (that's what stops the Executive Summary collision elsewhere). So instead
// this scopes the search to only the content sitting under the Competitive Landscape heading,
// finds the block whose text starts with the requested label, and returns the rest of that
// text - stopping continuation blocks at the next sibling label or the next real heading, so
// two adjacent competition types never bleed into each other.
const COMPETITION_INLINE_LABELS = [
  'Platform Competition',
  'Adjacent Competition',
  'Point Solution Competition',
  'Point Solutions Competition',
  'Direct Competition'
];

function isCompetitionInlineLabel(candidate) {
  const norm = normalizeHeaderText(candidate);
  return COMPETITION_INLINE_LABELS.some(l => normalizeHeaderText(l) === norm);
}

function buildLabelPrefixRegex(labelText) {
  const words = headerWordsOf(labelText);
  const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp('^\\s*' + escaped.join('[\\s-]+') + '\\s*[:\\-–—]?\\s*', 'i');
}

function findInlineCompetitionItems(landscapeHeaderEl, labelText) {
  const targetRe = buildLabelPrefixRegex(labelText);
  const siblingRes = COMPETITION_INLINE_LABELS
    .filter(l => normalizeHeaderText(l) !== normalizeHeaderText(labelText))
    .map(buildLabelPrefixRegex);

  const isHeadingLike = (el) => /^h[1-6]$/i.test(el.tagName) || el.getAttribute('role') === 'heading';
  const isTextBlock = (el) => /^(li|p|div|td|th)$/i.test(el.tagName);

  let block = landscapeHeaderEl;
  while (block.parentElement && block.parentElement.tagName !== 'BODY' && block.parentElement.children.length === 1) {
    block = block.parentElement;
  }

  const items = [];
  let collecting = false;
  let node = block.nextElementSibling;
  let guard = 0;

  while (node && !isHeadingLike(node) && guard < 200) {
    guard++;
    const allBlocks = isTextBlock(node) ? [node] : queryAllDeep('li, p, div, td, th', node);
    // Innermost blocks only, so a wrapping <div>/<li> around a <p> isn't counted twice.
    const textBlocks = allBlocks.filter(el => !el.querySelector('li, p, div, td, th'));
    const blocksToCheck = textBlocks.length > 0 ? textBlocks : [node];

    for (const b of blocksToCheck) {
      const text = b.textContent ? b.textContent.trim() : '';
      if (!text) continue;

      if (targetRe.test(text)) {
        collecting = true;
        const rest = text.replace(targetRe, '').trim();
        if (rest) items.push(rest);
        continue;
      }

      if (siblingRes.some(re => re.test(text))) {
        collecting = false;
        continue;
      }

      if (collecting) items.push(text);
    }

    node = node.nextElementSibling;
  }

  return items;
}

/**
 * Finds a clickable element (tab, button, link) whose text matches, for switching the
 * page's own in-app tabs (e.g. "Profile") rather than searching for report content.
 * Prioritizes [role="tab"] elements specifically, since that's the standard ARIA role for
 * tab controls (used by most tab-bar component libraries) and the most likely actual
 * target when a tab bar's visible text sits in a styled wrapper rather than a plain button.
 */
function findClickableElementByText(text) {
  const targetWords = headerWordsOf(text);
  if (targetWords.length === 0) return null;
  const targetNorm = targetWords.join(' ');

  const tabEls = queryAllDeep('[role="tab"]');
  const interactiveSelector = 'button, [role="tab"], [role="button"], a, [tabindex]';
  const interactiveEls = queryAllDeep(interactiveSelector);

  // Pass 1: exact match, real tabs first
  for (const el of tabEls) {
    if (normalizeHeaderText(el.textContent) === targetNorm) return el;
  }
  for (const el of interactiveEls) {
    if (normalizeHeaderText(el.textContent) === targetNorm) return el;
  }

  // Pass 2: full phrase contained (handles an icon/badge adding extra text), tabs first
  for (const el of tabEls) {
    const t = el.textContent.trim();
    if (t.length > 0 && t.length < 60 && normalizeHeaderText(t).includes(targetNorm)) return el;
  }
  for (const el of interactiveEls) {
    const t = el.textContent.trim();
    if (t.length > 0 && t.length < 60 && normalizeHeaderText(t).includes(targetNorm)) return el;
  }

  // Pass 3: bag-of-words closest fit, tabs first
  const tabMatch = bestBagOfWordsMatch(tabEls, targetWords);
  if (tabMatch) return tabMatch;
  const interactiveMatch = bestBagOfWordsMatch(interactiveEls, targetWords);
  if (interactiveMatch) return interactiveMatch;

  // Fallback: text often sits in a nested span inside the real clickable element - climb
  // up looking for the nearest ancestor that's actually interactive.
  const leafEls = queryAllDeep('*').filter(el => el.children.length === 0 && !el.shadowRoot);
  for (const el of leafEls) {
    const txt = el.textContent.trim();
    if (txt.length > 0 && txt.length < 40 && normalizeHeaderText(txt) === targetNorm) {
      let node = el;
      for (let i = 0; i < 8 && node; i++) {
        if (node.matches && node.matches(interactiveSelector)) return node;
        node = node.parentElement;
      }
      return el;
    }
  }

  return null;
}

/**
 * The report's section content (Founding Details, Customer Overview, Competitive
 * Landscape, etc.) only renders while the company page's "Profile" tab is selected - the
 * page opens on "Summary" by default, which is a different view entirely. Clicking
 * "Profile" when it's already selected is a harmless no-op, so this always clicks it
 * rather than trying to detect whether it's already active.
 */
function clickProfileTabIfFound() {
  // The tab is labeled "AI Profile" on the live page (confirmed via its
  // "radix-...-trigger-ai-profile" element id), so that's tried first; "Profile" is kept
  // as a fallback in case a report without the AI feature just shows "Profile".
  const tabNameCandidates = ['AI Profile', 'Profile'];

  let profileTab = null;
  for (const name of tabNameCandidates) {
    profileTab = findClickableElementByText(name);
    if (profileTab) break;
  }

  if (!profileTab) {
    const tabTexts = queryAllDeep('[role="tab"]').map(el => JSON.stringify(el.textContent.trim())).filter(t => t !== '""');
    console.log('Hyperlinks: could not find an "AI Profile"/"Profile" tab/button on this page. [role="tab"] elements found:', tabTexts);
    return;
  }
  console.log('Hyperlinks: found tab element ->', profileTab.tagName, profileTab.className, JSON.stringify(profileTab.textContent.trim()), profileTab);
  profileTab.click();
}

/**
 * Tries each candidate header name in order (e.g. "Point Solution Competition",
 * "Point Solutions Competition", "Direct Competition" as alternate names for the same
 * section), and reads back whatever's listed under the first one found on the page. Purely
 * a background data read - never scrolls, highlights, or switches focus to the tab.
 *
 * The page can take several seconds to finish loading/rendering the Profile tab's content
 * (observed ~8s on a real report), so rather than guessing a fixed delay, this clicks
 * Profile once and then polls for the target header to actually appear, checking every
 * 400ms up to maxWaitMs before giving up.
 */
function fetchSectionContent(headerCandidates, sendResponse) {
  const candidates = Array.isArray(headerCandidates) ? headerCandidates : [headerCandidates];
  clickProfileTabIfFound();

  const pollIntervalMs = 400;
  const maxWaitMs = 8000;
  const startTime = Date.now();

  function poll() {
    let el = null;
    let matchedHeader = null;
    for (const candidate of candidates) {
      el = findHeaderElement(candidate);
      if (el) {
        matchedHeader = candidate;
        break;
      }
    }

    if (el) {
      const items = extractItemsAfterHeader(el);
      sendResponse({ success: true, items, matchedHeader });
      return;
    }

    // None of the candidates are real headings - if any of them is actually an inline
    // label (Platform/Adjacent/Point Solution(s)/Direct Competition), look for it inside
    // the Competitive Landscape section's own body text instead. Each alias (e.g. singular
    // vs plural "Point Solution(s) Competition") is tried in turn since only one of them
    // will actually match the report's exact wording.
    const inlineCandidates = candidates.filter(isCompetitionInlineLabel);
    if (inlineCandidates.length > 0) {
      const landscapeHeading = findHeaderElement('Competitive Landscape');
      if (landscapeHeading) {
        for (const inlineCandidate of inlineCandidates) {
          const items = findInlineCompetitionItems(landscapeHeading, inlineCandidate);
          if (items.length > 0) {
            sendResponse({ success: true, items, matchedHeader: inlineCandidate });
            return;
          }
        }
      }
    }

    if (Date.now() - startTime >= maxWaitMs) {
      console.log(`Hyperlinks: gave up after ${maxWaitMs}ms looking for one of`, candidates, '- headings currently on page:',
        queryAllDeep('h1, h2, h3, h4, h5, h6, [role="heading"]').map(h => h.textContent.trim()).filter(Boolean));
      sendResponse({ success: false, items: [], matchedHeader: null });
      return;
    }

    setTimeout(poll, pollIntervalMs);
  }

  setTimeout(poll, 300); // give the Profile click a brief moment before the first check
}

/**
 * Finds all editable fields on the webpage and maps them.
 */
function scanForEditableFields() {
  // Clear previous data attributes to start fresh
  document.querySelectorAll('[data-hyperlinks-id]').forEach(el => {
    el.removeAttribute('data-hyperlinks-id');
  });
  fieldCounter = 0;

  const editableElements = [];
  
  // Select standard inputs, textareas, and contenteditable elements
  const candidates = document.querySelectorAll(
    'textarea, input[type="text"], input:not([type]), [contenteditable="true"], .ql-editor, .ck-content, .editor-container'
  );

  candidates.forEach(el => {
    // Skip hidden or disabled elements
    if (el.disabled || el.readOnly || el.type === 'hidden') return;
    
    // Check visibility
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    if (el.offsetWidth === 0 && el.offsetHeight === 0) return;

    // Avoid double counting (e.g. nested editors)
    if (el.closest('[data-hyperlinks-id]')) return;

    const id = `hl-field-${fieldCounter++}`;
    el.setAttribute('data-hyperlinks-id', id);

    editableElements.push({
      id: id,
      tagName: el.tagName.toLowerCase(),
      isContentEditable: el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.classList.contains('ql-editor') || el.classList.contains('ck-content'),
      label: getElementLabel(el),
      placeholder: el.placeholder || el.getAttribute('placeholder') || ''
    });
  });

  return editableElements;
}

/**
 * Infers a human-readable label for a given form element.
 */
function getElementLabel(el) {
  // 1. Associated label via ID (label[for="id"])
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label && label.textContent.trim()) {
      return sanitizeLabel(label.textContent);
    }
  }

  // 2. Parent label element (<label><input /></label>)
  const parentLabel = el.closest('label');
  if (parentLabel && parentLabel.textContent.trim()) {
    return sanitizeLabel(parentLabel.innerText.replace(el.innerText || '', ''));
  }

  // 3. Accessibility labels or title attributes
  const ariaLabel = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
  if (ariaLabel && !ariaLabel.startsWith('hl-') && ariaLabel.length < 50) {
    const labelledByEl = document.getElementById(ariaLabel);
    if (labelledByEl && labelledByEl.textContent.trim()) {
      return sanitizeLabel(labelledByEl.textContent);
    }
    return sanitizeLabel(ariaLabel);
  }
  
  if (el.title && el.title.trim()) {
    return sanitizeLabel(el.title);
  }

  // 4. Walk up the DOM tree (up to 5 levels) and scan for preceding headings or title class siblings
  let curr = el;
  for (let level = 0; level < 5 && curr && curr.tagName !== 'BODY'; level++) {
    // Check preceding siblings at this level
    let prev = curr.previousElementSibling;
    while (prev) {
      // Direct heading tag or label
      if (/^(H[1-6]|LABEL)$/i.test(prev.tagName) && prev.textContent.trim()) {
        const text = prev.textContent.trim();
        if (text.length > 2 && text.length < 100) {
          return sanitizeLabel(text);
        }
      }
      
      // Look for elements with classnames containing key indicators
      const foundHeader = prev.querySelector('h1, h2, h3, h4, h5, h6, label, [class*="title" i], [class*="label" i], [class*="header" i]');
      if (foundHeader && foundHeader.textContent.trim()) {
        const text = foundHeader.textContent.trim();
        if (text.length > 2 && text.length < 100) {
          return sanitizeLabel(text);
        }
      }

      // Check if the element itself contains title classes
      const className = prev.className && typeof prev.className === 'string' ? prev.className.toLowerCase() : '';
      if ((className.includes('title') || className.includes('header') || className.includes('label')) && prev.textContent.trim()) {
        const text = prev.textContent.trim();
        if (text.length > 2 && text.length < 100) {
          return sanitizeLabel(text);
        }
      }
      
      prev = prev.previousElementSibling;
    }
    
    // Check parent's inner header/title elements that are not ancestors of the field
    const parent = curr.parentElement;
    if (parent) {
      const heading = parent.querySelector('h1, h2, h3, h4, h5, h6, label, [class*="title" i], [class*="label" i], [class*="header" i]');
      if (heading && heading !== curr && !curr.contains(heading) && heading.textContent.trim()) {
        const text = heading.textContent.trim();
        if (text.length > 2 && text.length < 100) {
          return sanitizeLabel(text);
        }
      }
    }
    
    curr = parent;
  }

  // 5. Placeholders and metadata attributes
  if (el.placeholder || el.getAttribute('placeholder')) {
    return `Placeholder: ${el.placeholder || el.getAttribute('placeholder')}`;
  }

  if (el.name && el.name.trim()) {
    return `Name: ${el.name}`;
  }

  if (el.id && el.id.trim()) {
    return `ID: ${el.id}`;
  }

  return `Editable Field (${el.tagName.toLowerCase()})`;
}

/**
 * Cleans up noise in labels like extra colons, whitespace, asterisks
 */
function sanitizeLabel(text) {
  return text
    .replace(/[*:\-\s]+$/, '') // Remove trailing asterisks, colons, spaces
    .replace(/^[*:\-\s]+/, '') // Remove leading
    .replace(/\s+/g, ' ')      // Normalize whitespace
    .trim();
}

/**
 * Cleans inline styles from HTML so that the rich-text editor can style them natively
 */
function cleanHtmlForEditor(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  doc.body.querySelectorAll('*').forEach(node => {
    // Strip inline styles so the editor's stylesheet takes control
    node.removeAttribute('style');
    // Also remove structural properties that override theme tables
    node.removeAttribute('border');
    node.removeAttribute('cellpadding');
    node.removeAttribute('cellspacing');
  });
  
  return doc.body.innerHTML;
}

/**
 * Updates a standard textarea/input value using the native prototype descriptors
 * so that React/Vue state hooks are updated and saved upon page reload.
 */
function setReactInputValue(el, value) {
  try {
    const setter = el.tagName === 'TEXTAREA' 
      ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, value);
  } catch (e) {
    el.value = value;
  }
}

/**
 * Triggers React/Vue model change listeners on the updated elements
 */
function triggerStateEvents(el) {
  const events = ['input', 'change', 'blur'];
  events.forEach(eventName => {
    const event = new Event(eventName, { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
  });
}

/**
 * Legacy API compatibility mapping
 */
function pasteIntoElement(fieldId, htmlContent, plainText) {
  pasteFromClipboard(fieldId, htmlContent, plainText);
  return true;
}

/**
 * Dispatches a real paste-shaped event sequence (selectAll + beforeinput + paste with a
 * genuine DataTransfer) at the element. Most modern rich-text frameworks (Slate/Notion-style,
 * Draft.js, Lexical, TipTap, etc.) never observe raw DOM writes - they only sync their internal
 * document model through their 'paste' handler. Editors that DO implement a paste handler call
 * preventDefault() and read event.clipboardData themselves, which runs fine even on a synthetic
 * (untrusted) event. Editors with no JS paste handler simply won't react to this (no native
 * fallback fires for untrusted events), so we detect that and fall back to DOM surgery below.
 */
function dispatchSyntheticPaste(el, html, text) {
  try {
    const dt = new DataTransfer();
    dt.setData('text/html', html);
    dt.setData('text/plain', text);

    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    try {
      el.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'insertFromPaste',
        data: text,
        dataTransfer: dt,
        bubbles: true,
        cancelable: true
      }));
    } catch (e) {
      // InputEvent with dataTransfer isn't supported in every browser; safe to ignore.
    }

    el.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true
    }));

    return true;
  } catch (err) {
    console.error('Hyperlinks: Synthetic paste dispatch failed:', err);
    return false;
  }
}

/**
 * Clears any leftover readonly/disabled/contenteditable=false state so the field is
 * guaranteed to remain interactive after automation, and restores focus + cursor to the
 * end of the inserted content so the user can keep typing immediately.
 */
function ensureFieldIsEditable(el) {
  if (el.getAttribute('contenteditable') === 'false') {
    el.setAttribute('contenteditable', 'true');
  }
  el.removeAttribute('aria-disabled');
  if (!el.matches('input, textarea')) {
    el.removeAttribute('disabled');
    el.removeAttribute('readonly');
  }

  el.focus();
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  } catch (err) {
    // Not all elements support text ranges (e.g. plain inputs) - safe to ignore.
  }
}

/**
 * Orchestrates pasting into a field. Prefers a synthetic paste event (the sanctioned
 * integration point rich editors use to update their own state); only falls back to direct
 * DOM surgery when nothing appears to have consumed the paste.
 */
async function pasteFromClipboard(fieldId, htmlContent, plainText) {
  const el = document.querySelector(`[data-hyperlinks-id="${fieldId}"]`);
  if (!el) return false;

  const cleanHtml = cleanHtmlForEditor(htmlContent);
  const isContentEditable = el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.classList.contains('ql-editor') || el.classList.contains('ck-content');

  if (isContentEditable) {
    el.focus();
    const beforeHtml = el.innerHTML;
    const pasteHandled = dispatchSyntheticPaste(el, cleanHtml, plainText);
    const contentChanged = pasteHandled && el.innerHTML.trim() && el.innerHTML !== beforeHtml;

    if (!contentChanged) {
      // Last-resort fallback for editors with no JS paste handler at all.
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);

        const execSuccess = document.execCommand('insertHTML', false, cleanHtml);
        if (!execSuccess || !el.innerHTML.trim()) {
          el.innerHTML = cleanHtml;
        }
      } catch (err) {
        console.error('Failed to paste HTML via selection fallback, using innerHTML:', err);
        el.innerHTML = cleanHtml;
      }
    }

    ensureFieldIsEditable(el);
  } else {
    // Update plain textarea/input fields with React compatibility wrapper
    setReactInputValue(el, plainText);
  }

  triggerStateEvents(el);
  return true;
}

} // end of __hyperlinksContentScriptLoaded guard
