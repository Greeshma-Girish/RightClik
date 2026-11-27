function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "rc-answer",
      title: "Get Answer",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: "rc-image",
      title: "Get Answer (Image)",
      contexts: ["image"]
    });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  setupContextMenu();
  const current = await chrome.storage.local.get(["apiKey", "model", "systemPrompt"]);
  await chrome.storage.local.set({
    model: current.model || "gemini-2.5-flash-lite",
    apiKey: current.apiKey || "",
    systemPrompt: current.systemPrompt || "You are RightClick AI. Provide direct, accurate, and concise answers without conversational filler."
  });
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenu();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  const mode = info.menuItemId === "rc-image" ? "vision" : String(info.menuItemId).replace("rc-", "");
  const payload = {
    type: "RIGHTCLICK_OPEN",
    mode,
    text: info.selectionText || "",
    imageUrl: info.srcUrl || ""
  };
  try {
    await chrome.tabs.sendMessage(tab.id, payload);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    await chrome.tabs.sendMessage(tab.id, payload);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "RIGHTCLICK_ASK") {
    askGemini(message).then(sendResponse).catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

async function askGemini({ prompt, image, mimeType }) {
  const cfg = await chrome.storage.local.get(["apiKey", "model", "systemPrompt"]);
  const apiKey = (cfg.apiKey || "").trim();
  if (!apiKey) throw new Error("Gemini API key missing. Open extension Settings and add your key.");
  const model = (cfg.model || "gemini-2.5-flash-lite").trim();
  const system = cfg.systemPrompt || "You are RightClick AI, a helpful study and browsing assistant. Be accurate, clear and concise.";
  const parts = [{ text: `${system}\n\n${prompt}` }];
  if (image) {
    parts.push({ inline_data: { mime_type: mimeType || "image/jpeg", data: image } });
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.25, maxOutputTokens: 2048 }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Gemini API returned ${response.status}`;
    throw new Error(message);
  }
  const answer = (data.candidates?.[0]?.content?.parts || [])
    .map(part => part.text || "")
    .join("\n")
    .trim();
  if (!answer) throw new Error("Gemini did not return text. Check the model and request.");
  return { answer, model };
}