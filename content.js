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
    storageKey: 'ai_toc_sidebar_position', // Key for localStorage
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

  let isExpanded = true;

  // --- HTML Generation ---

  function createSidebar() {
    // If it exists, don't create
    if (document.getElementById(CONFIG.containerId)) return;

    const sidebar = document.createElement('div');
    sidebar.id = CONFIG.containerId;
    sidebar.innerHTML = `
      <div class="toc-resizer-left" title="调整宽度"></div>
      <div class="toc-resizer-bottom" title="调整高度"></div>
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

    // Initialize Position & Size
    restoreState(sidebar);

    // Event Listeners
    const toggleBtn = sidebar.querySelector('.toc-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', toggleSidebar);
    
    // Enable Dragging (Move)
    makeDraggable(sidebar);
    
    // Enable Resizing
    makeResizable(sidebar);

    // Initial Scan
    scanHeaders();
  }

  function toggleSidebar() {
    const sidebar = document.getElementById(CONFIG.containerId);
    if (!sidebar) return;
    isExpanded = !isExpanded;
    sidebar.classList.toggle('collapsed', !isExpanded);
  }

  // --- Persistence (Position & Size) ---

  function restoreState(sidebar) {
    const saved = localStorage.getItem(CONFIG.storageKey);
    let hasSavedState = false;

    if (saved) {
      try {
        const state = JSON.parse(saved);
        
        // Restore Position
        const maxX = window.innerWidth - 50;
        const maxY = window.innerHeight - 50;
        
        let left = Math.min(Math.max(0, state.left), maxX);
        let top = Math.min(Math.max(0, state.top), maxY);

        sidebar.style.left = left + 'px';
        sidebar.style.top = top + 'px';
        sidebar.style.right = 'auto'; 

        // Restore Width
        if (state.width) {
          sidebar.style.width = Math.max(200, Math.min(800, state.width)) + 'px';
        }

        // Restore Height
        if (state.height) {
          sidebar.style.height = Math.max(100, Math.min(window.innerHeight - 20, state.height)) + 'px';
        }

        hasSavedState = true;
      } catch (e) {
        console.error('AI TOC: Failed to restore state', e);
      }
    }

    if (!hasSavedState) {
      // Default: Top Right
      sidebar.style.top = '80px';
      sidebar.style.right = '20px'; 
      sidebar.style.left = 'auto';  
      // Height defaults to auto or CSS max-height logic initially
    }
  }

  function saveState(sidebar) {
    const rect = sidebar.getBoundingClientRect();
    const state = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
  }

  // --- Keep Alive / Watchdog ---
  function startKeepAlive() {
    setInterval(() => {
       const sidebar = document.getElementById(CONFIG.containerId);
       if (!sidebar) {
         createSidebar();
       }
    }, 1500); 
  }

  // --- Drag Logic (Move) ---

  function makeDraggable(elmnt) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const header = elmnt.querySelector(".toc-header");

    if (header) {
      header.onmousedown = dragMouseDown;
    }

    function dragMouseDown(e) {
      // Don't drag if clicking buttons
      if (e.target.tagName === 'BUTTON') return;
      // Don't drag if close to edges (resizer areas)
      if (e.offsetX < 15 || e.offsetY > (header.offsetHeight - 5)) return;

      e.preventDefault();
      
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
      
      elmnt.classList.add('dragging');
    }

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;

      elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
      elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
      elmnt.style.right = 'auto'; 
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
      elmnt.classList.remove('dragging');
      saveState(elmnt);
    }
  }

  // --- Resize Logic ---

  function makeResizable(sidebar) {
    const resizerL = sidebar.querySelector('.toc-resizer-left');
    const resizerB = sidebar.querySelector('.toc-resizer-bottom');
    
    let currentDir = '';

    if (resizerL) resizerL.addEventListener('mousedown', (e) => initResize(e, 'left'));
    if (resizerB) resizerB.addEventListener('mousedown', (e) => initResize(e, 'bottom'));

    function initResize(e, direction) {
      e.preventDefault();
      currentDir = direction;
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResize);
      sidebar.classList.add('resizing');
      
      const cursor = direction === 'left' ? 'col-resize' : 'row-resize';
      document.body.style.cursor = cursor;
    }

    function resize(e) {
      const rect = sidebar.getBoundingClientRect();
      
      if (currentDir === 'left') {
        // Width Logic (Anchored Right)
        let newWidth = rect.right - e.clientX;
        if (newWidth < 200) newWidth = 200;
        if (newWidth > 800) newWidth = 800;

        const newLeft = rect.right - newWidth;
        sidebar.style.width = `${newWidth}px`;
        sidebar.style.left = `${newLeft}px`;
        sidebar.style.right = 'auto';
      } 
      else if (currentDir === 'bottom') {
        // Height Logic (Anchored Top)
        let newHeight = e.clientY - rect.top;
        if (newHeight < 100) newHeight = 100;
        if (newHeight > window.innerHeight - 20) newHeight = window.innerHeight - 20;

        sidebar.style.height = `${newHeight}px`;
      }
    }

    function stopResize() {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResize);
      sidebar.classList.remove('resizing');
      document.body.style.cursor = 'default';
      saveState(sidebar);
    }
  }

  // --- Header Scanning Logic ---

  function generateId(text) {
    return text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function isHeaderLike(element) {
    if (element.tagName === 'STRONG') {
      const text = element.innerText.trim();
      if (text.length > 80) return false;
      if (text.length < 2) return false;
      if (/^(Note:|Warning:|Tip:|注意：|提示：|警告：)/i.test(text)) return false;
      if (/^(\d{1,2}:\d{2})/.test(text)) return false; 

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
       observeScroll(uniqueHeaders);
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
      let levelClass = `toc-${tagType}`;
      if (tagType === 'strong') levelClass = 'toc-strong';

      li.className = `toc-item ${levelClass}`;
      
      const a = document.createElement('a');
      a.href = `#${el.id}`;
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
    
    const links = document.querySelectorAll('.toc-item a');
    links.forEach(a => {
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

  // --- Boot ---

  createSidebar();
  startKeepAlive();

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