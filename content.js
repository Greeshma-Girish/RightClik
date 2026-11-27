(() => {
  if (window.__rightClickAIBubbleInstalled) return;
  window.__rightClickAIBubbleInstalled = true;

  let host = null;
  let shadow = null;
  let bubbleEl = null;
  let arrowEl = null;
  let dismissTimeout = null;
  let lastAnchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let savedRange = null;

  // Track mouse coordinates and selection range on contextmenu / right-click
  function recordMouseAndSelection(e) {
    if (e && typeof e.clientX === "number" && typeof e.clientY === "number") {
      lastAnchor = { x: e.clientX, y: e.clientY };
    }
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      try {
        savedRange = sel.getRangeAt(0).cloneRange();
      } catch {}
    }
  }

  window.addEventListener("contextmenu", recordMouseAndSelection, true);
  window.addEventListener("mousedown", (e) => {
    if (e.button === 2) recordMouseAndSelection(e);
  }, true);
  window.addEventListener("pointerdown", (e) => {
    if (e.button === 2) recordMouseAndSelection(e);
  }, true);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "RIGHTCLICK_OPEN") {
      handleGetAnswer(message.text, message.imageUrl);
    }
  });

  // Calculate best anchor point: mouse position with fallback to selection bounds
  function getAnchor() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      try {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          if (!lastAnchor.x || lastAnchor.x < 0 || lastAnchor.x > window.innerWidth) {
            return { x: rect.left + rect.width / 2, y: rect.top };
          }
        }
      } catch {}
    }
    return {
      x: lastAnchor.x || window.innerWidth / 2,
      y: lastAnchor.y || window.innerHeight / 2
    };
  }

  function ensureBubbleHost() {
    if (host && host.isConnected) return;

    host = document.createElement("div");
    host.id = "rightclick-ai-bubble-host";
    host.style.cssText = "all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
    shadow = host.attachShadow({ mode: "open" });

    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        .rc-bubble {
          position: fixed;
          pointer-events: auto;
          max-width: 360px;
          min-width: 48px;
          max-height: 240px;
          overflow-y: auto;
          padding: 8px 13px;
          border-radius: 12px;
          background: rgba(22, 25, 35, 0.96);
          color: #f3f5f9;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 13.5px;
          line-height: 1.5;
          letter-spacing: -0.01em;
          border: 1px solid rgba(255, 255, 255, 0.14);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          word-break: break-word;
          white-space: pre-wrap;
          opacity: 0;
          transform: translateY(6px) scale(0.97);
          transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          z-index: 2147483647;
          cursor: default;
        }
        .rc-bubble.visible {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        .rc-bubble.hiding {
          opacity: 0;
          transform: translateY(-4px) scale(0.97);
          transition: opacity 0.22s ease, transform 0.22s ease;
        }
        /* Custom scrollbar */
        .rc-bubble::-webkit-scrollbar {
          width: 4px;
        }
        .rc-bubble::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.25);
          border-radius: 4px;
        }
        .rc-bubble::-webkit-scrollbar-track {
          background: transparent;
        }

        /* Pointer arrow */
        .rc-arrow {
          position: fixed;
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s ease;
          z-index: 2147483647;
        }
        .rc-arrow.visible {
          opacity: 1;
        }
        .rc-arrow.hiding {
          opacity: 0;
        }
        .arrow-bottom {
          border-top: 6px solid rgba(22, 25, 35, 0.96);
        }
        .arrow-top {
          border-bottom: 6px solid rgba(22, 25, 35, 0.96);
        }

        /* 2-dot minimal loading state (no text) */
        .rc-loading {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 2px 2px;
          min-height: 14px;
        }
        .rc-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #8b7cff;
          animation: rcPulse 0.9s infinite ease-in-out;
        }
        .rc-dot:nth-child(2) {
          animation-delay: 0.22s;
        }
        @keyframes rcPulse {
          0%, 100% {
            transform: scale(0.65);
            opacity: 0.4;
          }
          50% {
            transform: scale(1.15);
            opacity: 1;
          }
        }
        .rc-error {
          color: #ff7b72;
        }
        .rc-autoselected {
          margin-top: 5px;
          font-size: 11.5px;
          color: #7ee787;
          display: flex;
          align-items: center;
          gap: 4px;
          font-weight: 500;
        }
      </style>
      <div class="rc-bubble"></div>
      <div class="rc-arrow"></div>
    `;

    document.documentElement.appendChild(host);
    bubbleEl = shadow.querySelector(".rc-bubble");
    arrowEl = shadow.querySelector(".rc-arrow");

    // Pause auto-dismiss on mouse hover to let user finish reading
    bubbleEl.addEventListener("mouseenter", () => {
      if (dismissTimeout) {
        clearTimeout(dismissTimeout);
        dismissTimeout = null;
      }
    });

    bubbleEl.addEventListener("mouseleave", () => {
      scheduleDismiss(2500);
    });

    // Dismiss immediately if user clicks the bubble
    bubbleEl.addEventListener("click", () => {
      dismissBubble();
    });
  }

  // Dismiss on clicking outside or pressing Escape
  window.addEventListener("pointerdown", (e) => {
    if (bubbleEl && bubbleEl.classList.contains("visible")) {
      const rect = bubbleEl.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        dismissBubble();
      }
    }
  }, true);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      dismissBubble();
    }
  }, true);

  function positionBubble(anchor) {
    if (!bubbleEl || !arrowEl) return;

    const width = bubbleEl.offsetWidth;
    const height = bubbleEl.offsetHeight;

    // Center bubble horizontally above anchor x
    let left = anchor.x - width / 2;
    const margin = 12;
    if (left < margin) left = margin;
    if (left + width > window.innerWidth - margin) {
      left = window.innerWidth - margin - width;
    }

    // Position above pointer by default
    const gap = 12;
    let top = anchor.y - height - gap;
    let isBelow = false;

    if (top < margin) {
      // Not enough space above pointer, place below
      top = anchor.y + gap + 6;
      isBelow = true;
    }

    bubbleEl.style.left = `${Math.round(left)}px`;
    bubbleEl.style.top = `${Math.round(top)}px`;

    // Arrow positioning
    let arrowLeft = anchor.x - 6;
    arrowLeft = Math.max(left + 12, Math.min(arrowLeft, left + width - 24));
    arrowEl.style.left = `${Math.round(arrowLeft)}px`;

    if (isBelow) {
      arrowEl.style.top = `${Math.round(top - 6)}px`;
      arrowEl.className = "rc-arrow arrow-top visible";
    } else {
      arrowEl.style.top = `${Math.round(top + height)}px`;
      arrowEl.className = "rc-arrow arrow-bottom visible";
    }
  }

  function scheduleDismiss(durationMs) {
    if (dismissTimeout) clearTimeout(dismissTimeout);
    dismissTimeout = setTimeout(() => {
      dismissBubble();
    }, durationMs);
  }

  function dismissBubble() {
    if (dismissTimeout) {
      clearTimeout(dismissTimeout);
      dismissTimeout = null;
    }
    if (!bubbleEl) return;
    bubbleEl.classList.remove("visible");
    bubbleEl.classList.add("hiding");
    if (arrowEl) {
      arrowEl.classList.remove("visible");
      arrowEl.classList.add("hiding");
    }
    setTimeout(() => {
      if (bubbleEl) {
        bubbleEl.classList.remove("hiding");
        bubbleEl.innerHTML = "";
        bubbleEl.style.left = "-9999px";
        bubbleEl.style.top = "-9999px";
      }
      if (arrowEl) {
        arrowEl.classList.remove("hiding");
        arrowEl.style.left = "-9999px";
        arrowEl.style.top = "-9999px";
      }
    }, 220);
  }

  function formatText(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    let safe = div.innerHTML;
    // Format bold **text**
    safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    // Format inline code `code`
    safe = safe.replace(/`([^`]+)`/g, "<code style='background:rgba(255,255,255,0.12);padding:2px 5px;border-radius:4px;font-size:0.9em;'>$1</code>");
    return safe;
  }

  // Parse Gemini response for MCQ option and concise answer
  function parseResponse(raw) {
    if (!raw) return { answer: "", option: null, optionText: null };
    const optionMatch = raw.match(/^OPTION:\s*([A-Za-z0-9]+)/m);
    const textMatch = raw.match(/^OPTION_TEXT:\s*(.+)$/m);
    const answerMatch = raw.match(/^ANSWER:\s*([\s\S]+)$/m);

    const option = optionMatch ? optionMatch[1].trim() : null;
    const optionText = textMatch ? textMatch[1].trim() : null;
    let answer = answerMatch ? answerMatch[1].trim() : raw.trim();

    // Clean any prefix tags from answer
    answer = answer.replace(/^OPTION:.*$/m, "").replace(/^OPTION_TEXT:.*$/m, "").replace(/^ANSWER:\s*/m, "").trim();

    // Fallback detection if Gemini didn't format tags but gave e.g. "B) Paris" or "B. Paris"
    let fallbackOption = option;
    if (!fallbackOption) {
      const leadMatch = answer.match(/^([A-Ea-e1-5])[\.\):\s-]/);
      if (leadMatch) fallbackOption = leadMatch[1];
    }

    return {
      answer: answer || raw.trim(),
      option: fallbackOption,
      optionText
    };
  }

  // Automatically find and select the MCQ option on the webpage
  function autoselectOption(optionLetter, optionText, range) {
    if (!optionLetter && !optionText) return false;

    // Find the enclosing question container from the selection range
    let searchRoot = document.body;
    if (range) {
      let node = range.commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      let curr = node;
      for (let i = 0; i < 6 && curr && curr !== document.body; i++) {
        if (curr.querySelector("input[type='radio'], input[type='checkbox'], [role='radio'], [role='option'], .choice, .option")) {
          searchRoot = curr;
          break;
        }
        curr = curr.parentElement;
      }
      if (searchRoot === document.body && node) {
        searchRoot = node;
      }
    }

    const cleanLetter = (optionLetter || "").toUpperCase().trim();
    const letterIndex = cleanLetter ? "ABCDE12345".indexOf(cleanLetter) : -1;
    const normalizedIndex = letterIndex >= 5 ? letterIndex - 5 : letterIndex;
    const cleanText = (optionText || "").toLowerCase().trim();

    function selectAndHighlight(el) {
      if (!el) return false;

      // If input has associated label, prefer clicking the label
      let target = el;
      if (el instanceof HTMLInputElement && el.id) {
        const label = searchRoot.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label) target = label;
      }

      try {
        target.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch {}

      // Dispatch realistic mouse & pointer events
      const events = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
      events.forEach(type => {
        target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      });

      if (el instanceof HTMLInputElement) {
        el.checked = true;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }

      // Visual feedback: outline the selected element
      const highlight = target.closest("label, li, tr, .choice, .option") || target;
      const prevOutline = highlight.style.outline;
      const prevShadow = highlight.style.boxShadow;
      const prevTransition = highlight.style.transition;

      highlight.style.transition = "outline 0.2s ease, box-shadow 0.2s ease";
      highlight.style.outline = "2px solid #8b7cff";
      highlight.style.boxShadow = "0 0 10px rgba(139, 124, 255, 0.4)";

      setTimeout(() => {
        highlight.style.outline = prevOutline;
        highlight.style.boxShadow = prevShadow;
        highlight.style.transition = prevTransition;
      }, 2000);

      return true;
    }

    // Strategy 1: Standard radio/checkbox inputs
    const inputs = Array.from(searchRoot.querySelectorAll("input[type='radio'], input[type='checkbox']"));
    if (inputs.length > 0) {
      // Check input value or name
      for (const input of inputs) {
        const val = (input.value || "").trim().toUpperCase();
        if (cleanLetter && (val === cleanLetter || val.startsWith(cleanLetter))) {
          return selectAndHighlight(input);
        }
      }

      // Check input label text
      for (const input of inputs) {
        let label = input.closest("label");
        if (!label && input.id) {
          label = searchRoot.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        }
        if (!label && input.parentElement) {
          label = input.parentElement;
        }
        if (label) {
          const lText = (label.textContent || "").toLowerCase();
          if (cleanText && lText.includes(cleanText)) {
            return selectAndHighlight(input);
          }
          if (cleanLetter && (lText.trim().startsWith(cleanLetter.toLowerCase() + ")") || lText.trim().startsWith(cleanLetter.toLowerCase() + "."))) {
            return selectAndHighlight(input);
          }
        }
      }

      // Match by option index (e.g. B -> index 1)
      if (normalizedIndex >= 0 && normalizedIndex < inputs.length) {
        return selectAndHighlight(inputs[normalizedIndex]);
      }
    }

    // Strategy 2: ARIA roles or custom choice elements
    const choices = Array.from(searchRoot.querySelectorAll("[role='radio'], [role='option'], [role='checkbox'], .choice, .option, .answer, .quiz-option"));
    if (choices.length > 0) {
      for (const choice of choices) {
        const cText = (choice.textContent || "").trim();
        if (cleanText && cText.toLowerCase().includes(cleanText)) {
          return selectAndHighlight(choice);
        }
        if (cleanLetter && (cText.toUpperCase().startsWith(cleanLetter + ")") || cText.toUpperCase().startsWith(cleanLetter + "."))) {
          return selectAndHighlight(choice);
        }
      }

      if (normalizedIndex >= 0 && normalizedIndex < choices.length) {
        return selectAndHighlight(choices[normalizedIndex]);
      }
    }

    // Strategy 3: Deepest clickable text match
    if (cleanText) {
      const candidates = Array.from(searchRoot.querySelectorAll("label, button, li, p, span, div"));
      const matched = candidates.filter(el => {
        const txt = (el.textContent || "").toLowerCase().trim();
        return txt.includes(cleanText) && el.children.length <= 2;
      });
      if (matched.length > 0) {
        matched.sort((a, b) => (a.textContent || "").length - (b.textContent || "").length);
        const best = matched[0];
        const clickable = best.closest("label, button, a, [role='button'], li") || best;
        return selectAndHighlight(clickable);
      }
    }

    return false;
  }

  async function handleGetAnswer(text, imageUrl) {
    if (!text && !imageUrl) return;

    ensureBubbleHost();
    if (dismissTimeout) {
      clearTimeout(dismissTimeout);
      dismissTimeout = null;
    }

    const anchor = getAnchor();
    const currentRange = savedRange;

    // Show initial loading bubble with 2 dots only (no "Thinking…" text)
    bubbleEl.innerHTML = `
      <div class="rc-loading" aria-label="Loading">
        <span class="rc-dot"></span>
        <span class="rc-dot"></span>
      </div>
    `;
    bubbleEl.classList.remove("hiding");
    bubbleEl.classList.add("visible");

    // Position immediately above pointer
    positionBubble(anchor);
    requestAnimationFrame(() => positionBubble(anchor));

    try {
      let result;
      if (imageUrl) {
        const image = await fetchImage(imageUrl);
        const prompt = "Analyze this image. If it is an MCQ, state the correct option letter, option text, and answer. Otherwise, give a concise answer.";
        result = await chrome.runtime.sendMessage({
          type: "RIGHTCLICK_ASK",
          prompt,
          image: image.data,
          mimeType: image.mimeType,
          mode: "vision"
        });
      } else {
        const prompt = `Analyze this text.
If this is a Multiple Choice Question (MCQ) with options (A, B, C, D or 1, 2, 3, 4):
1. Identify the single correct option.
2. Reply strictly in this format:
OPTION: <letter or number of correct option, e.g. A, B, C, D>
OPTION_TEXT: <exact text of that option>
ANSWER: <concise answer, e.g. B) Paris>

If this is NOT an MCQ, simply reply in this format:
ANSWER: <direct concise answer in 1-2 sentences>

Text:
${text}`;

        result = await chrome.runtime.sendMessage({
          type: "RIGHTCLICK_ASK",
          prompt,
          mode: "answer"
        });
      }

      if (result?.error) {
        bubbleEl.innerHTML = `<span class="rc-error">⚠️ ${formatText(result.error)}</span>`;
        requestAnimationFrame(() => positionBubble(anchor));
        scheduleDismiss(5000);
      } else {
        const parsed = parseResponse(result?.answer);
        const answerText = parsed.answer || "No response received.";

        // Attempt to autoselect MCQ option on page
        let autoselected = false;
        if (parsed.option || parsed.optionText) {
          autoselected = autoselectOption(parsed.option, parsed.optionText, currentRange);
        }

        let html = formatText(answerText);
        if (autoselected) {
          html += `<div class="rc-autoselected">✓ Selected option on page</div>`;
        }

        bubbleEl.innerHTML = html;
        requestAnimationFrame(() => positionBubble(anchor));

        // Auto-dismiss duration based on answer length: ~5.5-10s
        const autoDismissMs = Math.min(10000, Math.max(5500, 4500 + answerText.length * 15));
        scheduleDismiss(autoDismissMs);
      }
    } catch (err) {
      bubbleEl.innerHTML = `<span class="rc-error">⚠️ ${formatText(err?.message || "An unexpected error occurred.")}</span>`;
      requestAnimationFrame(() => positionBubble(anchor));
      scheduleDismiss(5000);
    }
  }

  async function fetchImage(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Image fetch failed");
    const blob = await response.blob();
    const mimeType = blob.type || "image/jpeg";
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { data: dataUrl.split(",")[1], mimeType };
  }
})();
