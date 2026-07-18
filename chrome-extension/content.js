/**
 * Chrome Extension Content Script
 * Scans the page for editable elements and handles programmatically pasting content.
 */

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
  }
  return true; // Keep message channel open for async response
});

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
