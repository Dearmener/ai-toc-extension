// AI Chat TOC Sidebar - Content Script

(function () {
  'use strict';

  const CONFIG = {
    // Selectors to find headers
    selectors: [
      'h1', 'h2', 'h3',                // Standard HTML headers
      '.markdown strong',              // Bold text in Markdown blocks (GPT style)
      'strong',                        // Fallback bold text
      'article h1', 'article h2', 'article h3', // Semantic HTML
      'main h1', 'main h2', 'main h3'
    ],
    containerId: 'ai-toc-sidebar-root',
    // Where to look for content? 
    // .markdown = GPT/DeepSeek
    // .model-response-text = Gemini
    // article, main = Generic sites (Claude, Poe, Blogs)
    chatContentSelector: '.markdown, .message-content, .model-response-text, article, main, .prose' 
  };

  let activeHeaderId = null;
  let isExpanded = true;

  // --- HTML Generation ---

  function createSidebar() {
    if (document.getElementById(CONFIG.containerId)) return;

    const sidebar = document.createElement('div');
    sidebar.id = CONFIG.containerId;
    sidebar.innerHTML = `
      <div class="toc-header">
        <span class="toc-title">Contents</span>
        <button class="toc-toggle" title="Toggle Sidebar">_</button>
      </div>
      <div class="toc-body">
        <ul id="toc-list"></ul>
      </div>
    `;

    document.body.appendChild(sidebar);

    // Event Listeners
    sidebar.querySelector('.toc-toggle').addEventListener('click', toggleSidebar);
    
    // Initial Scan
    scanHeaders();
  }

  function toggleSidebar() {
    const sidebar = document.getElementById(CONFIG.containerId);
    isExpanded = !isExpanded;
    sidebar.classList.toggle('collapsed', !isExpanded);
  }

  // --- Logic ---

  function generateId(text) {
    return text.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function isHeaderLike(element) {
    // Filter out "bold" text that isn't acting like a header
    if (element.tagName === 'STRONG') {
      // Must be short enough to be a title (< 80 chars)
      if (element.innerText.length > 80) return false;
      
      // Must not be empty
      if (element.innerText.trim().length < 2) return false;

      // Must be the only thing in its parent paragraph or start of line
      const parent = element.parentElement;
      if (parent && parent.innerText.trim() === element.innerText.trim()) return true;
      // Or followed by a line break
      if (element.nextSibling && element.nextSibling.tagName === 'BR') return true;
      
      return false; // Valid strict filtering
    }
    
    // For normal H1-H3 tags, ignore if they are inside the sidebar itself
    if (element.closest('#' + CONFIG.containerId)) return false;

    // Ignore empty headers
    if (element.innerText.trim().length === 0) return false;

    return true;
  }

  function scanHeaders() {
    const list = document.getElementById('toc-list');
    if (!list) return;

    // Find all potential headers in the main chat areas
    const contentAreas = document.querySelectorAll(CONFIG.chatContentSelector);
    if (contentAreas.length === 0) return; // No chat/content loaded yet

    let allHeaders = [];
    contentAreas.forEach(area => {
      // Avoid scanning the sidebar itself if it was accidentally selected by 'main' or 'article'
      if (area.id === CONFIG.containerId) return;
      
      const headers = area.querySelectorAll(CONFIG.selectors.join(','));
      headers.forEach(h => allHeaders.push(h));
    });

    // Deduplicate and filter
    const uniqueHeaders = [];
    const seenMap = new Set();
    
    allHeaders.forEach(el => {
      if (!isHeaderLike(el)) return;
      // Check visibility roughly
      if (el.offsetParent === null) return; 

      if (!seenMap.has(el)) {
        seenMap.add(el);
        uniqueHeaders.push(el);
      }
    });

    // Re-render only if count changes (basic diffing)
    if (list.childElementCount === uniqueHeaders.length && uniqueHeaders.length > 0) {
       // Optimization: Assume structure hasn't changed if count is same
       // In production, we might check IDs or text
       return; 
    }

    list.innerHTML = '';

    if (uniqueHeaders.length === 0) {
      list.innerHTML = '<li class="toc-empty">No headers found</li>';
      return;
    }

    uniqueHeaders.forEach((el, index) => {
      const text = el.innerText.trim();
      if (!text) return;

      // Ensure element has ID
      if (!el.id) el.id = `toc-${generateId(text)}-${index}`;

      const li = document.createElement('li');
      // normalize tag name for styling (treat article h1 as h1)
      const tagType = el.tagName.toLowerCase();
      li.className = `toc-item toc-${tagType}`;
      
      const a = document.createElement('a');
      a.href = `#${el.id}`;
      a.innerText = text;
      a.onclick = (e) => {
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };

      li.appendChild(a);
      list.appendChild(li);
    });

    observeScroll(uniqueHeaders);
  }

  // --- Scroll Observer ---
  
  let observer = null;
  function observeScroll(headers) {
    if (observer) observer.disconnect();

    const options = {
      root: null,
      rootMargin: '-10% 0px -80% 0px',
      threshold: 0
    };

    observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          highlightLink(entry.target.id);
        }
      });
    }, options);

    headers.forEach(h => observer.observe(h));
  }

  function highlightLink(id) {
    if (activeId === id) return;
    activeId = id;
    
    document.querySelectorAll('.toc-item a').forEach(a => {
      const parent = a.parentElement;
      if (a.getAttribute('href') === `#${id}`) {
        parent.classList.add('active');
        // Optional: scroll the TOC itself to keep active item in view
        a.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        parent.classList.remove('active');
      }
    });
  }
  let activeId = null;

  // --- Initialization ---

  // Run on load
  createSidebar();

  // Watch for dynamic content (AI generating text)
  const mutationObserver = new MutationObserver((mutations) => {
    // Debounce slightly
    if (window.tocTimeout) clearTimeout(window.tocTimeout);
    window.tocTimeout = setTimeout(() => {
      scanHeaders();
    }, 1000);
  });

  mutationObserver.observe(document.body, { childList: true, subtree: true });

  // Handle URL changes (SPA)
  let lastUrl = location.href; 
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(scanHeaders, 1000); // Wait for new page load
    }
  }).observe(document, {subtree: true, childList: true});

})();