const hosts = ["chatgpt.com", "gemini.google.com", "claude.ai"];

chrome.action.onClicked.addListener(async (tab) => {
  const url = tab.url && new URL(tab.url);
  if (!url || url.protocol !== "https:" || !hosts.includes(url.hostname)) {
    await chrome.action.setBadgeText({ tabId: tab.id, text: "IA" });
    await chrome.action.setTitle({ tabId: tab.id, title: "Abre ChatGPT, Gemini o Claude" });
    return;
  }
  await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["panel.js"] });
});
