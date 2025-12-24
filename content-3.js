// AI Chat TOC Sidebar - Content Script

(function () {
  'use strict';

  const CONFIG = {
    // Selectors to find headers
    selectors: [
      'h1', 'h2', 'h3',                // Standard HTML headers
      '.markdown strong',              // Bold text in Markdown blocks (GPT style)
      '.markdown-body strong',         // NextChat / Common Markdown
      '.lobe-markdown strong',         // LobeChat
      'strong',                        // Fallback bold text
      'article h1', 'article h2', 'article h3', // Semantic HTML
      'main h1', 'main h2', 'main h3'
    ],
    containerId: 'ai-toc-sidebar-root',
    chatContentSelector: `
      .markdown, 
      .message-content, 
      .model-response-text, 
      .markdown-body,
      .lobe-markdown,
      article, 
      main, 
      .prose,
      div[class*="message"],
      div[class*="content"]
    `
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
        <span class="toc-title">目录</span>
        <div class="toc-actions">
           <button class="toc-toggle" title="折叠/展开">_</button>
        </div>
      </div>
      <div class="toc-body">
        <ul id="toc-list"></ul>
      </div>
    `;

    document.body.appendChild(sidebar);

    // Initial Position (Fixed default, but overridable by drag)
    sidebar.style.top = '80px';
    sidebar.style.right = '20px';

    // Event Listeners
    sidebar.querySelector('.toc-toggle').addEventListener('click', toggleSidebar);
    
    // Enable Dragging
    makeDraggable(sidebar);

    // Initial Scan
    scanHeaders();
  }

  function toggleSidebar() {
    const sidebar = document.getElementById(CONFIG.containerId);
    isExpanded = !isExpanded;
    sidebar.classList.toggle('collapsed', !isExpanded);
  }

  // --- Drag Logic ---

  function makeDraggable(elmnt) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const header = elmnt.querySelector(".toc-header");

    if (header) {
      header.onmousedown = dragMouseDown;
    }

    function dragMouseDown(e) {
      // Don't drag if clicking buttons inside the header
      if (e.target.tagName === 'BUTTON') return;

      e.preventDefault();
      // get the mouse cursor position at startup:
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      // call a function whenever the cursor moves:
      document.onmousemove = elementDrag;
      
      // Add dragging class for visual feedback
      elmnt.classList.add('dragging');
    }

    function elementDrag(e) {
      e.preventDefault();
      // calculate the new cursor position:
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;

      // set the element's new position:
      // We explicitly unset 'right' so 'left' takes precedence during drag
      elmnt.style.right = 'auto'; 
      elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
      elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
      // stop moving when mouse button is released:
      document.onmouseup = null;
      document.onmousemove = null;
      elmnt.classList.remove('dragging');
    }
  }

  // --- Logic ---

  function generateId(text) {
    return text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function isHeaderLike(element) {
    // Filter out "bold" text that isn't acting like a header
    if (element.tagName === 'STRONG') {
      const text = element.innerText.trim();
      if (text.length > 80) return false;
      if (text.length < 2) return false;
      if (/^(Note:|Warning:|Tip:|注意：|提示：|警告：)/i.test(text)) return false;

      const parent = element.parentElement;
      if (parent) {
         if (parent.innerText.trim() === text) return true;
         if (element.nextSibling && element.nextSibling.tagName === 'BR') return true;
         if (parent.tagName === 'P' && parent.innerText.indexOf(text) === 0 && parent.innerText.length < text.length + 5) return true;
      }
      return false; 
    }
    
    if (element.closest('#' + CONFIG.containerId)) return false;
    if (element.innerText.trim().length === 0) return false;

    return true;
  }

  function scanHeaders() {
    const list = document.getElementById('toc-list');
    if (!list) return;

    const selectors = CONFIG.chatContentSelector.split(',').map(s => s.trim());
    let contentAreas = [];
    
    selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => contentAreas.push(el));
    });

    if (contentAreas.length === 0) {
        contentAreas = [document.body];
    }

    let allHeaders = [];
    contentAreas.forEach(area => {
      if (area.id === CONFIG.containerId) return;
      if (area.tagName === 'NAV' || area.tagName === 'HEADER' || area.tagName === 'FOOTER') return;
      
      const headers = area.querySelectorAll(CONFIG.selectors.join(','));
      headers.forEach(h => allHeaders.push(h));
    });

    // Deduplicate and filter
    const uniqueHeaders = [];
    const seenMap = new Set();
    
    allHeaders.forEach(el => {
      if (!isHeaderLike(el)) return;
      if (el.offsetParent === null) return; 

      if (!seenMap.has(el)) {
        seenMap.add(el);
        uniqueHeaders.push(el);
      }
    });

    if (list.childElementCount === uniqueHeaders.length && uniqueHeaders.length > 0) {
       return; 
    }

    list.innerHTML = '';

    if (uniqueHeaders.length === 0) {
      list.innerHTML = '<li class="toc-empty">未找到目录</li>';
      return;
    }

    uniqueHeaders.forEach((el, index) => {
      const text = el.innerText.trim();
      if (!text) return;

      if (!el.id) el.id = `toc-${generateId(text)}-${index}`;

      const li = document.createElement('li');
      const tagType = el.tagName.toLowerCase();
      // Treat strong as h2 or h3 depending on context, defaulting to h2-like for visibility
      let levelClass = `toc-${tagType}`;
      if (tagType === 'strong') levelClass = 'toc-strong';

      li.className = `toc-item ${levelClass}`;
      
      const a = document.createElement('a');
      a.href = `#${el.id}`;
      // Add indentation visual cue
      a.innerHTML = `<span class="toc-text">${text}</span>`;
      
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
        a.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        parent.classList.remove('active');
      }
    });
  }
  let activeId = null;

  // --- Initialization ---

  createSidebar();

  const mutationObserver = new MutationObserver((mutations) => {
    if (window.tocTimeout) clearTimeout(window.tocTimeout);
    window.tocTimeout = setTimeout(() => {
      scanHeaders();
    }, 1000);
  });

  mutationObserver.observe(document.body, { childList: true, subtree: true });

  let lastUrl = location.href; 
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(scanHeaders, 1000); 
    }
  }).observe(document, {subtree: true, childList: true});

})();