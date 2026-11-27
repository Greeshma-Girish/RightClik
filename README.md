# RightClick AI — Gemini Edition

Personal Chrome extension using Google Gemini API. This project is independent and is not affiliated with RightClick.

## Features
- Right-click selected text: Answer, Explain, Hint, Pointers, MCQ and Essay.
- Double-click selected text to open a quick Answer panel.
- Vision Scan from an image context menu.
- Image upload from the extension popup.
- Premium dark interface and configurable Gemini model.
- Local Chrome storage for your API key and settings.

## Requirements
- Google Chrome / Chromium
- Gemini API key from https://aistudio.google.com/apikey
- Internet connection

## Install
1. Extract `rightclick-ai-gemini.zip`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted folder containing `manifest.json`.

## Configure
1. Click the extension icon.
2. Open **Settings**.
3. Paste your Gemini API key.
4. Keep the default model `gemini-2.5-flash-lite`, or enter another model currently available to your API key.
5. Click **Test connection**, then **Save settings**.

## Use
- Select text on a webpage → right-click → choose a RightClick AI action.
- Double-click selected text to open the quick Answer panel.
- Right-click an image → Scan image.
- Click the extension icon to ask a question or upload an image.

## Privacy and costs
The API key is stored in `chrome.storage.local` in your Chrome profile. Prompts and images are sent to Google's Gemini API. This is not local/offline AI. Gemini API free-tier availability, quotas, model access and pricing can change; check https://ai.google.dev/gemini-api/docs/pricing. Do not share your API key or publish a build containing your personal key. Local extension storage is not a secure secrets vault.

## Limitations
- Some pages (Chrome Web Store, `chrome://` pages, browser PDF viewer and other restricted pages) do not permit content-script injection.
- Double-click activation depends on the page exposing selected text and may not work in every editor.
- Image context-menu scanning depends on the source site allowing the image to be fetched. Use popup image upload as a fallback.
- Answer quality depends on the chosen Gemini model and prompt.
