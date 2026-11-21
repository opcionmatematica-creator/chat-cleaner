# Chat Cleaner

**English** · [Español](README.es.md)

A browser extension for Chromium-based browsers (Chrome, Edge, Brave) that bulk-deletes conversations in **ChatGPT**, **Gemini** and **Claude** while keeping the ones you have pinned or starred.

It works by clicking through each service's own web interface, inside the open tab and with your normal session. It uses no servers and stores no data: it only requests the `activeTab` and `scripting` permissions, which take effect when you click the extension icon.

> ⚠️ Deleting a chat cannot be undone. Review the list before confirming.

> The extension's panel is in Spanish. Button names below are shown as they appear on screen, with their English meaning.

## Installation

1. Download this repository: **Code → Download ZIP** and unzip it, or clone it:
   ```
   git clone https://github.com/opcionmatematica-creator/chat-cleaner.git
   ```
2. Open your browser's extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the folder that contains `manifest.json`.

It works the same on Windows, macOS and Linux.

## Usage

1. Open ChatGPT, Gemini or Claude while signed in, and keep the chat history visible in the sidebar.
2. Click the **Limpiador de chats** icon in the extensions menu. A panel opens in the corner of the page.
3. Click **Calibrar menú** (*calibrate menu*) and then click the **⋯** button of any chat in the history. This teaches the panel which button opens each row's menu.
4. Click **Revisar chats** (*review chats*). The panel opens each chat's menu and classifies it:
   - **protegido** (*protected*): pinned or starred. Never selected.
   - **no fijado** (*not pinned*): can be deleted.
   - **verifica si es favorito** (*check if starred*, Claude only): select it manually only if you recognize it.
5. Click **Seleccionar no fijados** (*select unpinned*) and untick any chats you want to keep.
6. Click **Borrar seleccionados** (*delete selected*), type `BORRAR` and click **Confirmar borrado** (*confirm deletion*).

Click **Cancelar** (*cancel*) or press **Esc** to stop any operation. Keep the tab visible while it works.

### What gets reviewed in each service

- **Gemini**: walks the whole sidebar history and loads older chats automatically.
- **ChatGPT and Claude**: reviews the chats visible on screen. Scroll and click **Revisar chats** again to process the rest.
- Chats inside **projects** and **archived** chats are left out.

## Safety

Before deleting each chat, the extension reopens its menu and checks that it is still not pinned. If the row changed, disappeared, or an unexpected window shows up, it skips that chat or stops the batch.

## Limitations

The extension recognizes menus by their Spanish and English labels. If a service changes its interface, the extension may stop recognizing the buttons; in that case the panel skips chats instead of deleting them.

To apply an update: download the new version, click **Update** on the extensions page and reload the service's tab.

## Help pages

- [ChatGPT: pinned chats](https://help.openai.com/en/articles/6825453-how-do-i-use-chatgpt-with-browsing)
- [Gemini: manage recent and pinned chats](https://support.google.com/gemini/answer/13666746)
- [Claude: delete or rename a conversation](https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation)

## License

[MIT](LICENSE)
