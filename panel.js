(() => {
  "use strict";

  const existing = document.getElementById("limpiador-chats-panel");
  const version = chrome.runtime.getManifest().version;
  if (existing) {
    if (existing.dataset.version !== version) {
      const status = existing.shadowRoot?.getElementById("status");
      if (status) status.textContent = "Este panel es de una versión anterior. Recarga esta pestaña y abre Limpiador " + version + ".";
    } else {
      existing.shadowRoot?.querySelector("select")?.focus();
    }
    return;
  }

  const profiles = {
    "chatgpt.com": { name: "ChatGPT", path: /^\/c\/[\w-]+\/?$/ },
    "gemini.google.com": { name: "Gemini", path: /^\/(?:u\/\d+\/)?app\/[\w-]+\/?$/i },
    "claude.ai": { name: "Claude", path: /^\/chat\/[\w-]+\/?$/ }
  };
  const profile = profiles[location.hostname];
  if (!profile) return;

  const normalize = (value) => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
  const pin = /^(pin(?: chat| conversation)?|fijar(?: chat| conversacion)?|anclar(?: chat| conversacion)?|star(?: chat| conversation)?|add to (?:favorites|starred)(?: chats)?|agregar a favoritos|anadir a favoritos|marcar como favorito)$/;
  const unpin = /^(unpin(?: chat| conversation)?|desfijar(?: chat| conversacion)?|dejar de fijar(?: chat| conversacion)?|quitar chincheta|desanclar(?: chat| conversacion)?|unstar(?: chat| conversation)?|remove from (?:favorites|starred)(?: chats)?|quitar de favoritos|eliminar de favoritos)$/;
  const deletion = /^(delete(?: chat| conversation)?|eliminar(?: chat| conversacion)?|borrar(?: chat| conversacion)?)$/;
  const triggers = "button,[role=button],[aria-haspopup=menu]";
  const menuActions = "[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],button,[role=button]";
  const dialogs = "dialog,[role=dialog],[role=alertdialog],mat-dialog-container,.mat-mdc-dialog-container,.cdk-dialog-container";
  const dialogTitle = /^[¿?\s]*(eliminar (?:esta )?(?:conversacion|chat)|delete (?:this )?(?:conversation|chat))[?\s]*$/;
  const cancelLabel = /^(cancel|cancelar)$/;
  const menus = '[role="menu"],.mat-mdc-menu-panel,[data-radix-menu-content]';
  const protectedSection = /^(pinned(?: chats)?|starred(?: chats)?|favorites|favourites|fijad[oa]s|chats fijados|favoritos)$/;

  const host = document.createElement("div");
  host.id = "limpiador-chats-panel";
  host.dataset.version = version;
  host.style.cssText = "all:initial;position:fixed;inset:16px 16px auto auto;z-index:2147483647";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      *{box-sizing:border-box} section{width:min(410px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:#fff;color:#172435;border:1px solid #cbd5e1;border-radius:14px;padding:18px;font:14px/1.45 system-ui;box-shadow:0 12px 42px #0004}
      h2{font-size:19px;margin:0} header{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}
      label, p{display:block;margin:9px 0} select,button,input{font:inherit} button,select{padding:6px 9px;border:1px solid #aab7c5;border-radius:6px;background:#f5f7fa;color:inherit} button{cursor:pointer} button:disabled{opacity:.45;cursor:default}
      button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #2563eb;outline-offset:2px} .row{display:flex;flex-wrap:wrap;gap:6px} ul{padding:0;list-style:none;max-height:34vh;overflow:auto;margin:8px 0} li{border-bottom:1px solid #e4e9ef;padding:5px 2px;overflow-wrap:anywhere} li label{margin:0} #run{color:white;background:#9d2525;border-color:#9d2525} #status{white-space:pre-line}
    </style>
    <section aria-label="Limpiador de chats">
      <header><h2>Limpiador de chats · ${profile.name}</h2><button id="close" aria-label="Cerrar">Cerrar</button></header>
      <div class="row"><button id="calibrate">Calibrar menú</button><button id="scan" disabled>Revisar chats</button><button id="stop" disabled>Cancelar</button></div>
      <p id="status" role="status">Expande el historial y pulsa «Calibrar menú».</p>
      <output id="progress" style="display:block"></output>
      <ul id="list" aria-label="Vista previa"></ul>
      <div class="row"><button id="select" disabled>Seleccionar no fijados</button><button id="run" disabled>Borrar seleccionados</button></div>
      <form id="confirm-batch" hidden>
        <p id="batch-count"></p>
        <label>Escribe BORRAR para confirmar <input id="batch-word" required pattern="BORRAR" autocomplete="off"></label>
        <button type="submit">Confirmar borrado</button>
      </form>
    </section>`;
  document.body.append(host);

  const $ = (id) => shadow.getElementById(id);

  let calibration;
  let picking = false;
  let busy = false;
  let stopped = false;
  let results = [];
  let historyPosition = [];
  const announce = (message) => { $("status").textContent = message; };
  const visible = (node) => node.getClientRects().length > 0 && !node.closest("[hidden],[inert]") && getComputedStyle(node).visibility === "visible";
  const text = (node) => (node.innerText || node.textContent || "").trim().replace(/\s+/g, " ");
  // Texto sin elementos aria-hidden: ChatGPT añade el atajo de teclado (p. ej. «Desfijar» + «P») como texto oculto.
  const spokenText = (node) => {
    if (!node.querySelector?.("[aria-hidden=true]")) return text(node);
    const copy = node.cloneNode(true);
    for (const hidden of copy.querySelectorAll("[aria-hidden=true]")) hidden.remove();
    return copy.textContent.trim().replace(/\s+/g, " ");
  };
  const hasLabel = (node, pattern) => [node.getAttribute("aria-label"), text(node), spokenText(node), node.getAttribute("title")].some((value) => pattern.test(normalize(value)));
  const elements = (root, query) => Array.from(root.querySelectorAll(query)).filter(visible);
  const check = () => {
    if (stopped) throw new Error("Operación cancelada.");
    if (document.hidden || location.pathname !== initialPath) throw new Error("Se detuvo porque cambiaste de pestaña, de ventana o de página. Deja esta pestaña a la vista, pulsa «Revisar chats» y vuelve a borrar: se procesan solo los chats que quedan.");
  };
  let initialPath;
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function chatId(link) {
    const target = new URL(link.href, location.href);
    if (target.origin !== location.origin || !profile.path.test(target.pathname)) return "";
    return target.pathname.replace(/\/$/, "");
  }

  const chatLinks = (root) => elements(root, "a[href]").filter(chatId);

  function slotAt(link) {
    if (!link.isConnected || !onScreen(link)) return null;
    const { top, bottom, left, right } = link.getBoundingClientRect();
    if (bottom <= top || right <= left) return null;
    return { x: (left + right) / 2, y: (top + bottom) / 2 };
  }

  function occupantAt(scope, slot) {
    if (!slot || !scope.isConnected) return null;
    const hits = chatLinks(scope).filter((link) => {
      const rect = link.getBoundingClientRect();
      return onScreen(link) && rect.top <= slot.y && slot.y < rect.bottom &&
        rect.left <= slot.x && slot.x < rect.right;
    });
    return hits.length === 1 ? hits[0] : null;
  }

  function onScreen(link) {
    const rect = link.getBoundingClientRect();
    let top = 0;
    let bottom = innerHeight;
    for (let node = link.parentElement; node && node !== document.body; node = node.parentElement) {
      if (!/auto|scroll|overlay|hidden|clip/.test(getComputedStyle(node).overflowY)) continue;
      const clip = node.getBoundingClientRect();
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
    }
    return rect.top < bottom && rect.bottom > top;
  }

  function rememberHistoryPosition(links) {
    const positions = new Map();
    for (const link of links) {
      for (let node = link.parentElement; node && node !== document.body; node = node.parentElement) {
        if (positions.has(node)) break;
        if (node.scrollHeight > node.clientHeight && /auto|scroll|overlay/.test(getComputedStyle(node).overflowY)) {
          positions.set(node, node.scrollTop);
        }
      }
    }
    return Array.from(positions);
  }

  async function collectHistory() {
    const first = chatLinks(calibration.scope);
    historyPosition = rememberHistoryPosition(first);
    const found = new Map();
    const collect = () => {
      const links = chatLinks(calibration.scope);
      for (const link of links) {
        if (!onScreen(link)) continue;
        const id = chatId(link);
        if (!found.has(id)) found.set(id, {
          id, title: text(link) || link.getAttribute("aria-label") || id,
          state: "uncertain", position: rememberHistoryPosition([link])
        });
      }
    };
    const scroller = historyPosition[0]?.[0];
    if (!scroller) {
      collect();
      return Array.from(found.values());
    }
    try {
      scroller.scrollTo({ top: 0, behavior: "instant" });
      await delay(120);
      while (scroller.isConnected) {
        check();
        collect();
        announce("Cargando historial de " + profile.name + " · " + found.size + " chats encontrados");
        const before = scroller.scrollTop;
        const next = before + Math.max(1, Math.floor(scroller.clientHeight * 0.8));
        scroller.scrollTo({ top: next, behavior: "instant" });
        await delay(90);
        if (scroller.scrollTop > before) continue;
        // Al llegar al final, el sitio muestra un indicador de carga y añade más chats tras ~1-2 s.
        const height = scroller.scrollHeight;
        let grew = false;
        for (let waited = 0; waited < 4000 && !grew; waited += 250) {
          await delay(250);
          check();
          collect();
          grew = scroller.scrollHeight > height + 40;
        }
        if (grew) continue;
        if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) break;
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: "instant" });
        await delay(90);
        if (scroller.scrollTop > before) continue;
        throw new Error(profile.name + " dejó de desplazar el historial. Vuelve a revisar con la barra lateral abierta.");
      }
      if (!scroller.isConnected) throw new Error(profile.name + " reemplazó el historial durante la revisión. Vuelve a abrir el panel.");
      return Array.from(found.values());
    } finally {
      for (const [node, top] of historyPosition) {
        if (node.isConnected) node.scrollTo({ top, behavior: "instant" });
      }
    }
  }

  async function resolveItem(item) {
    const find = () => {
      const copies = chatLinks(calibration.scope).filter((link) => chatId(link) === item.id);
      const matches = controlsFor(item.id);
      if (matches.some(protectedRow)) return { reason: "protected" };
      if (copies.length !== 1 || matches.length !== 1) return null;
      return matches[0];
    };
    let match = find();
    if (match) return match;
    for (const [node, top] of item.position || historyPosition) {
      if (node.isConnected) node.scrollTo({ top, behavior: "instant" });
    }
    if (profile.name === "Gemini") {
      const links = chatLinks(calibration.scope).filter((link) => chatId(link) === item.id);
      if (links.length === 1) revealMenu(links[0]);
    }
    match = await waitFor(() => stopped ? null : find(), 400);
    check();
    return match || { reason: "unavailable" };
  }

  function findRow(link, control) {
    let row = link;
    for (let depth = 0; row && depth < 7; depth++, row = row.parentElement) {
      const links = chatLinks(row);
      if (links.some((item) => item !== link)) break;
      if (row.contains(control) && row !== control) return row;
    }
    return null;
  }

  function geminiRows(link) {
    const rows = [];
    for (let node = link; node && node !== calibration.scope && calibration.scope.contains(node); node = node.parentElement) {
      if (Array.from(node.querySelectorAll("a[href]")).some((a) => a !== link && chatId(a))) break;
      rows.push(node);
    }
    return rows;
  }

  let hovered = [];
  function revealMenu(link) {
    if (!onScreen(link)) link.scrollIntoView({ block: "center", behavior: "instant" });
    const rows = geminiRows(link);
    for (const old of hovered) {
      if (old.isConnected && !rows.includes(old)) old.dispatchEvent(new MouseEvent("mouseleave"));
    }
    link.focus({ preventScroll: true });
    for (const row of rows.slice().reverse()) {
      row.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }));
      row.dispatchEvent(new MouseEvent("mouseenter"));
    }
    link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    hovered = rows;
  }

  function geminiMenuButton(button) {
    if (button.matches("a[href],:disabled,[aria-disabled=true]")) return false;
    if (button.matches(calibration.selector) && calibration.hasSignature) return true;
    if (button.getAttribute("aria-haspopup") === "menu" || button.hasAttribute("matmenutriggerfor")) return true;
    const labels = ["aria-label","title","data-test-id","data-testid","class"].map((name) => normalize(button.getAttribute(name)));
    return labels.some((label) => /(?:more.options|more.actions|mas opciones|otras opciones|opciones de (?:la )?conversacion|conversation.actions|chat.options|conversation.menu)/.test(label)) ||
      Array.from(button.querySelectorAll("mat-icon,i,svg,.material-symbols-outlined,.material-icons,[data-mat-icon-name]")).some((icon) =>
        /^(more_vert|more_horiz|ellipsis|ellipsis-vertical|more-vertical|more-horizontal)$/.test(
          normalize(icon.getAttribute("data-mat-icon-name") || icon.getAttribute("data-lucide") || icon.textContent)));
  }

  function controlsFor(id) {
    const matches = [];
    for (const link of chatLinks(calibration.scope).filter((item) => chatId(item) === id)) {
      if (link === calibration.sampleLink &&
          !calibration.sampleButton.matches("a[href],:disabled,[aria-disabled=true]")) {
        const row = findRow(link, calibration.sampleButton);
        if (row && calibration.scope.contains(row)) {
          matches.push({ link, row, button: calibration.sampleButton });
          continue;
        }
      }
      if (profile.name === "Gemini") {
        const rows = geminiRows(link);
        const controls = Array.from(rows.at(-1)?.querySelectorAll(triggers) || []).filter(geminiMenuButton)
          .filter((button, _, all) => !all.some((outer) => outer !== button && outer.contains(button)));
        const exact = calibration.hasSignature ? controls.filter((button) => button.matches(calibration.selector)) : [];
        const choices = exact.length === 1 ? exact : controls;
        if (choices.length === 1) {
          const button = choices[0];
          matches.push({ link, row: rows.find((row) => row.contains(button)), button });
        }
        continue;
      }
      let row = link;
      for (let depth = 0; row && depth <= calibration.depth; depth++) {
        if (depth < calibration.depth) { row = row.parentElement; continue; }
        if (!calibration.scope.contains(row)) break;
        const controls = Array.from(row.querySelectorAll(triggers)).filter((button) =>
          button.matches(calibration.selector) && !button.matches(":disabled,[aria-disabled=true]"));
        if (controls.length === 1 && findRow(link, controls[0]) === row) matches.push({ link, row, button: controls[0] });
      }
    }
    return matches;
  }

  function protectedRow({ row }) {
    const pinCue = /^(pinned(?: chat| conversation)?|fijad[oa](?: chat)?|starred|favorito)$/;
    if ([row, ...row.querySelectorAll("[aria-label],[title]")].some((item) => hasLabel(item, pinCue))) return true;
    for (let section = row.parentElement; section && section !== calibration.scope.parentElement; section = section.parentElement) {
      const label = document.getElementById(section.getAttribute("aria-labelledby") || "");
      if (protectedSection.test(normalize(section.getAttribute("aria-label"))) ||
          (label && protectedSection.test(normalize(text(label))))) return true;
      for (const child of section.children) {
        const heading = child.matches("h1,h2,h3,h4,[role=heading]") ? child :
          child.querySelector(":scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > [role=heading]");
        if (child.contains(row)) break;
        if (heading && protectedSection.test(normalize(text(heading)))) return true;
      }
    }
    return false;
  }

  function render() {
    $("list").replaceChildren();
    for (const item of results) {
      const li = document.createElement("li");
      const label = document.createElement("label");
      if (["ready", "manual"].includes(item.state)) {
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = item.selected;
        box.disabled = busy;
        box.addEventListener("change", () => { item.selected = box.checked; dismissConfirmation(); refresh(); });
        label.append(box, " ");
      }
      label.append(item.title + ({
        ready: "", manual: " (verifica si es favorito)", protected: " (protegido)",
        uncertain: " (omitido: estado o menú sin verificar)", deleted: " (borrado)",
        unavailable: " (omitido: fila no disponible; vuelve a revisar)"
      })[item.state]);
      li.append(label);
      $("list").append(li);
    }
    refresh();
  }

  function refresh() {
    const unavailable = busy || picking;
    $("calibrate").disabled = unavailable;
    $("scan").disabled = unavailable || !calibration?.scope.isConnected;
    $("select").disabled = unavailable || !results.some((item) => item.state === "ready");
    $("run").disabled = unavailable || !results.some((item) => item.selected);
    $("stop").disabled = stopped && busy || !(busy || picking || results.some((item) => item.selected));
    $("close").disabled = busy;
  }

  function dismissConfirmation() {
    $("confirm-batch").hidden = true;
    $("batch-word").value = "";
  }

  function resetPicking() {
    picking = false;
    window.removeEventListener("click", capture, true);
    window.removeEventListener("pointerdown", holdCalibrationClick, true);
    refresh();
  }

  function holdCalibrationClick(event) {
    if (!event.composedPath().includes(host) && event.target.closest(triggers)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function capture(event) {
    if (event.composedPath().includes(host)) return;
    const button = event.target.closest(triggers);
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const scope = button.closest("nav,aside,[role=navigation],main,[role=main]");
    if (!scope) {
      announce("Usa el botón ⋯ junto a un chat en el historial.");
      return;
    }
    const candidates = chatLinks(scope).map((link) => ({ link, row: findRow(link, button) })).filter(({ row }) => row && scope.contains(row));
    if (candidates.length !== 1) {
      announce("No pude asociar ese botón con un chat. Prueba con otro botón ⋯ del historial.");
      return;
    }
    const { link, row } = candidates[0];
    if (button.matches("a[href],:disabled,[aria-disabled=true]") || [deletion, pin, unpin].some((pattern) => hasLabel(button, pattern))) {
      announce("Has pulsado el enlace o una acción del chat. Pulsa los tres puntos ⋯ de esa misma fila.");
      return;
    }
    let depth = 0;
    for (let node = link; node !== row; node = node.parentElement) depth++;
    const peers = Array.from(row.querySelectorAll(triggers)).filter((node) => node !== button && node.localName === button.localName);
    // Un atributo solo sirve de firma si otras filas lo comparten. Gemini y Claude ponen el título
    // del chat en aria-label («Más opciones para …»), así que ese valor solo encaja con esta fila.
    const otherRows = chatLinks(scope).filter((item) => chatId(item) !== chatId(link)).slice(0, 6).map((item) => {
      let node = item;
      for (let level = 0; node && level < depth; level++) node = node.parentElement;
      return node;
    }).filter(Boolean);
    const shared = (name, value) => !otherRows.length ||
      otherRows.some((other) => Array.from(other.querySelectorAll(triggers)).some((peer) => peer.getAttribute(name) === value));
    const signature = ["data-testid","data-test-id","aria-label","title","aria-haspopup"].find((name) => {
      const value = button.getAttribute(name);
      if (!value || !shared(name, value)) return false;
      return peers.every((peer) => peer.getAttribute(name) !== value);
    });
    const selector = button.localName + (signature ? "[" + signature + '="' + CSS.escape(button.getAttribute(signature)) + '"]' : "");
    calibration = { scope, depth, selector, hasSignature: Boolean(signature), sampleButton: button, sampleLink: link };
    resetPicking();
    announce("Menú calibrado. Pulsa «Revisar chats» para generar la vista previa.");
  }

  $("calibrate").onclick = () => {
    picking = true;
    calibration = undefined;
    results = [];
    render();
    announce("Haz clic en el botón ⋯ junto al título de un chat. El clic se usa para reconocer el botón.");
    window.addEventListener("pointerdown", holdCalibrationClick, true);
    window.addEventListener("click", capture, true);
  };
  $("stop").onclick = () => {
    stopped = true;
    dismissConfirmation();
    if (picking) {
      resetPicking();
      announce("Calibración cancelada.");
    } else if (busy) {
      announce("Cancelando la operación…");
      refresh();
    } else {
      clearSelection();
      render();
      announce("Selección descartada.");
    }
  };

  function clearSelection() {
    for (const item of results) item.selected = false;
  }

  function keyboard(event) {
    if (!event.isTrusted) return;
    if (event.key === "Escape" && (busy || picking || event.composedPath().includes(host))) $("stop").click();
    if (busy && !event.composedPath().includes(host)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  function blockPointer(event) {
    if (!busy || !event.isTrusted || event.composedPath().includes(host)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  window.addEventListener("keydown", keyboard, true);
  for (const event of ["pointerdown","mousedown","pointerup","mouseup","click"]) window.addEventListener(event, blockPointer, true);
  $("close").onclick = () => {
    resetPicking();
    window.removeEventListener("keydown", keyboard, true);
    for (const event of ["pointerdown","mousedown","pointerup","mouseup","click"]) window.removeEventListener(event, blockPointer, true);
    host.remove();
  };

  async function waitFor(read, timeout = 1800) {
    const deadline = performance.now() + timeout;
    do {
      const value = read();
      if (value) return value;
      await delay(50);
    } while (performance.now() < deadline);
    return null;
  }

  function clickControl(control) {
    if (control.matches("a[href],:disabled,[aria-disabled=true]")) {
      throw new Error("El control no es un botón disponible.");
    }
    const preventNavigation = (event) => event.preventDefault();
    const withinLink = control.closest("a[href]");
    if (withinLink) control.addEventListener("click", preventNavigation, true);
    try {
      control.click();
    } finally {
      if (withinLink) control.removeEventListener("click", preventNavigation, true);
    }
  }

  function dialogButtons(root, pattern) {
    const controls = elements(root, "button,[role=button]").filter((item) => hasLabel(item, pattern));
    return controls.filter((item) => !controls.some((other) => item !== other && other.contains(item)));
  }

  function geminiDeleteDialog() {
    if (profile.name !== "Gemini") return null;
    const titles = elements(document, "h1,h2,h3,[role=heading],[mat-dialog-title],.mat-mdc-dialog-title,[slot=title]")
      .filter((item) => hasLabel(item, dialogTitle));
    const candidates = new Set();
    for (const title of titles) {
      for (let node = title.parentElement, depth = 0; node && node !== document.body && depth < 8; node = node.parentElement, depth++) {
        if (dialogButtons(node, deletion).length === 1 && dialogButtons(node, cancelLabel).length === 1) {
          candidates.add(node.closest(dialogs) || node);
          break;
        }
      }
    }
    return candidates.size === 1 ? candidates.values().next().value : null;
  }

  async function openMenu(match, id) {
    const { button } = match;
    if ([deletion, pin, unpin].some((pattern) => hasLabel(button, pattern))) {
      throw new Error("El botón asociado es una acción directa. Calibra el botón ⋯ de esa fila.");
    }
    const isPopup = (node) => {
      if (!visible(node) || !onScreen(node) || node.closest('[aria-hidden="true"]') ||
          node.contains(match.link) || chatLinks(node).length) return false;
      return node.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false;
    };
    const popups = (query) => Array.from(document.querySelectorAll(query)).filter(isPopup);
    const existingMenus = new Set(popups(menus));
    // Si el botón declara qué menú controla (aria-controls, p. ej. Gemini), solo se mira ese menú.
    // Así un menú anterior que tardó en cerrarse no se confunde con el de esta fila.
    const ownMenu = (menu) => {
      // aria-controls aparece cuando el menú ya está abierto, así que se lee en cada búsqueda.
      const owner = [button, button.closest("[aria-controls]"), button.querySelector("[aria-controls]")]
        .find((node) => node?.getAttribute("aria-controls"));
      const target = owner && document.getElementById(owner.getAttribute("aria-controls"));
      return !target || target === menu || target.contains(menu) || menu.contains(target);
    };
    const find = () => {
      const controls = new Set(popups(menus).filter((menu) => !existingMenus.has(menu) && ownMenu(menu))
        .flatMap((menu) => elements(menu, menuActions)));
      const items = Array.from(controls);
      const deletes = items.filter((item) => hasLabel(item, deletion)).filter((item, _, matching) =>
        !matching.some((other) => other !== item && other.contains(item)));
      if (deletes.length > 1) throw new Error("Aparecieron varios botones de borrado.");
      if (deletes.length !== 1) return null;
      const remove = deletes[0];
      const menu = remove.closest(menus);
      return { remove, menu, button, actions: items.filter((item) => menu.contains(item)) };
    };
    const dialog = geminiDeleteDialog() || popups(dialogs)[0];
    if (dialog) {
      throw new Error("Hay un diálogo abierto (" + dialog.localName + "). Cancélalo antes de continuar.");
    }
    if (!onScreen(match.link)) {
      match.link.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      await delay(40);
    }
    check();
    const current = controlsFor(id);
    if (current.length !== 1 || current[0].button !== button || current[0].link !== match.link ||
        chatLinks(calibration.scope).filter((link) => chatId(link) === id).length !== 1) return null;
    if (button.hasAttribute("data-state") && button.getAttribute("aria-haspopup") === "menu") {
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }));
      if (!await waitFor(find, 250) && !stopped) clickControl(button);
    } else {
      clickControl(button);
    }
    const result = await waitFor(find, 900);
    if (!result) {
      // El menú puede abrirse tarde. Si aparece, se cierra para que no quede abierto junto al de la fila siguiente.
      const late = await waitFor(find, 700);
      if (late) {
        await closeMenu(late);
        return null;
      }
      if (popups(menus).some((menu) => !existingMenus.has(menu))) throw new Error("El menú se abrió, pero no encontré la acción «Eliminar». Ciérralo antes de continuar.");
    }
    return result;
  }

  async function closeMenu({ menu, button }) {
    // Durante la animación el menú puede parecer oculto aunque siga abierto; aria-expanded del botón es fiable.
    const expanded = () => [button, button.closest("[aria-haspopup=menu]"), button.querySelector("[aria-haspopup=menu]")]
      .some((node) => node?.getAttribute("aria-expanded") === "true");
    const closed = () => (!visible(menu) || !!menu.closest('[aria-hidden="true"]') ||
      menu.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) === false) && !expanded();
    if (closed()) return;
    const backdrop = elements(document, ".cdk-overlay-backdrop");
    if (profile.name === "Gemini" && backdrop.length === 1) {
      clickControl(backdrop[0]);
      if (await waitFor(closed, 250)) return;
    }
    const focused = menu.contains(document.activeElement) ? document.activeElement : menu;
    focused.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true
    }));
    if (await waitFor(closed, 400)) return;
    if (button.isConnected && button.getAttribute("aria-expanded") === "true") clickControl(button);
    if (!await waitFor(closed, 500)) throw new Error("El menú sigue abierto tras intentar cerrarlo. Guarda el diagnóstico.");
  }

  function classify(actions) {
    if (actions.some((item) => hasLabel(item, unpin))) return "protected";
    if (actions.some((item) => hasLabel(item, pin))) return "ready";
    return profile.name === "Claude" ? "manual" : "uncertain";
  }

  async function task(work) {
    dismissConfirmation();
    busy = true;
    stopped = false;
    initialPath = location.pathname;
    render();
    try { await work(); }
    catch (error) {
      announce(error.message + " Revisa la lista para ver el progreso.");
    }
    finally {
      if (stopped) clearSelection();
      busy = false;
      render();
    }
  }

  $("scan").onclick = () => task(async () => {
    results = [];
    results = await collectHistory();
    if (!results.length) {
      announce("No encontré chats en la parte visible del historial. Expándelo o desplázate y vuelve a revisar.");
      return;
    }
    const identities = Array.from(results);
    let consecutiveFailures = 0;
    for (const [index, item] of identities.entries()) {
      check();
      announce("Revisando " + (index + 1) + " de " + identities.length + "…");
      const match = await resolveItem(item);
      if (match.reason) { item.state = match.reason; continue; }
      const opened = await openMenu(match, item.id);
      if (!opened) {
        check();
        if (++consecutiveFailures === 3) throw new Error("Tres menús seguidos no se pudieron abrir. Recarga la página y vuelve a calibrar.");
        continue;
      }
      consecutiveFailures = 0;
      item.state = classify(opened.actions);
      await closeMenu(opened);
      check();
    }
    const counts = (state) => results.filter((item) => item.state === state).length;
    announce("Revisión terminada. " + counts("ready") + " no fijados, " + counts("protected") + " protegidos, " + (counts("uncertain") + counts("unavailable")) + " omitidos y " + counts("manual") + " por verificar manualmente.");
  });

  $("select").onclick = () => {
    dismissConfirmation();
    for (const item of results) if (item.state === "ready") item.selected = true;
    render();
  };

  function selectedBatch() {
    return results.filter((item) => item.selected && ["ready", "manual"].includes(item.state));
  }

  $("run").onclick = () => {
    const batch = selectedBatch();
    const manual = batch.filter((item) => item.state === "manual").length;
    $("batch-count").textContent = "Se borrarán hasta " + batch.length + " chats de " + profile.name +
      ". Esta acción es irreversible." + (manual ? " Incluye " + manual + " chats verificados manualmente." : "");
    $("confirm-batch").hidden = false;
    $("batch-word").focus();
  };

  $("confirm-batch").onsubmit = (event) => {
    event.preventDefault();
    if (busy || $("batch-word").value !== "BORRAR") return;
    const batch = selectedBatch();
    if (!batch.length) return;
    return task(async () => {
      $("progress").textContent = "";
      let deleted = 0;
      let skipped = 0;
      const pending = new Map(batch.map((item) => [item.id, item]));
      for (const [index, item] of batch.entries()) {
        pending.delete(item.id);
        check();
        const progress = (step) => {
          announce("Chat " + (index + 1) + " de " + batch.length + " · " + step);
          $("progress").textContent = "Borrados: " + deleted + " · Omitidos: " + skipped;
        };
        progress("Localizando fila");
        const match = await resolveItem(item);
        progress("Abriendo menú");
        const opened = match.reason ? null : await openMenu(match, item.id);
        if (!opened) {
          check();
          item.selected = false;
          item.state = match.reason || "unavailable";
          skipped++;
          render();
          continue;
        }
        const currentState = classify(opened.actions);
        if (stopped || currentState !== item.state || protectedRow(match)) {
          await closeMenu(opened);
          check();
          item.selected = false;
          item.state = currentState === "protected" || protectedRow(match) ? "protected" : "uncertain";
          skipped++;
          render();
          continue;
        }
        check();
        if (!match.link.isConnected || chatId(match.link) !== item.id ||
            !opened.menu.contains(opened.remove) || !opened.remove.isConnected) {
          await closeMenu(opened);
          throw new Error("La fila o su menú cambió antes de pulsar Eliminar. Revisa el lote.");
        }
        const slot = slotAt(match.link);
        progress("Esperando respuesta de " + profile.name);
        clickControl(opened.remove);
        const rowGone = () => calibration.scope.isConnected &&
          !Array.from(calibration.scope.querySelectorAll("a[href]")).some((link) => chatId(link) === item.id);
        let missingSince;
        const outcome = await waitFor(() => {
          const geminiDialog = geminiDeleteDialog();
          if (geminiDialog) return { dialog: geminiDialog };
          const current = elements(document, dialogs).filter((node, _, all) =>
            !all.some((other) => node !== other && other.contains(node)));
          if (profile.name !== "Gemini" && current.length === 1 && dialogButtons(current[0], deletion).length === 1) return { dialog: current[0] };
          if (current.length) return null;
          if (profile.name === "Gemini" && rowGone() && !visible(opened.menu) && match.row.isConnected === false) {
            missingSince ??= performance.now();
            if (performance.now() - missingSince >= 250) return {};
          } else {
            missingSince = undefined;
          }
          return null;
        }, 3000);
        if (!outcome) {
          check();
          throw new Error("Tras pulsar «Eliminar», no apareció un diálogo único ni pude verificar que desapareciera «" + item.title + "».");
        }
        const { dialog } = outcome;
        if (dialog) {
          if (stopped) {
            const cancel = dialogButtons(dialog, cancelLabel);
            if (cancel.length === 1) clickControl(cancel[0]);
          }
          check();
          const confirm = dialogButtons(dialog, deletion);
          if (confirm.length !== 1) throw new Error("El diálogo no tiene un botón único de confirmación.");
          progress("Confirmando en el diálogo");
          clickControl(confirm[0]);
          progress("Verificando que el chat desapareció");
          if (!await waitFor(() => !visible(dialog) && rowGone(), 5000)) {
            throw new Error("No se pudo verificar el borrado de «" + item.title + "».");
          }
        }
        item.selected = false;
        item.state = "deleted";
        deleted++;
        const replacement = occupantAt(calibration.scope, slot);
        const nextItem = replacement && pending.get(chatId(replacement));
        if (nextItem) nextItem.position = rememberHistoryPosition([replacement]);
        $("progress").textContent = "Borrados: " + deleted + " · Omitidos: " + skipped;
        render();
        check();
      }
      announce("Borrados: " + deleted + ". Omitidos: " + skipped + ".");
    });
  };
  refresh();
  $("calibrate").focus();
})();
