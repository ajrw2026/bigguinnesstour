/*
 * Fansly message cleaner — iPhone / Safari bookmarklet (source)
 *
 * Deletes ALL of YOUR messages in the currently-open chat (no date filter).
 * Targets Fansly's real markup: message-wrapper elements, "margin-right"
 * timestamp = your message.
 *
 * Buttons: Scan | Delete all mine (two-tap) | Debug | Close
 * One-line version to paste into a bookmark: bookmarklet.txt
 */
(async () => {
  "use strict";

  const SEL = {
    scroll: "[class*='message-collection-wrapper'],[class*='message-list'],[class*='messages'],[class*='thread'],[class*='conversation']",
    message: "[class*='message-wrapper']",
    del: "button[aria-label*='delete' i],button[aria-label*='unsend' i],[title*='delete' i],[class*='delete'],[class*='trash']",
    menu: "button[aria-label*='more' i],button[aria-label*='option' i],[class*='more-option'],[class*='msg-menu']"
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // Poll fn() until it returns something truthy or timeout — lets us react the
  // instant the UI changes instead of waiting fixed delays (much faster).
  async function waitFor(fn, timeout, interval) {
    const start = Date.now();
    for (;;) {
      let v; try { v = fn(); } catch (e) { v = null; }
      if (v) return v;
      if (Date.now() - start >= timeout) return null;
      await sleep(interval || 60);
    }
  }
  // Find the element that actually scrolls the messages: walk up from a real
  // message to the nearest overflow:auto/scroll ancestor. Fall back to class
  // match, then the page itself.
  const scroller = () => {
    const m = document.querySelector(SEL.message);
    if (m) {
      let el = m.parentElement;
      while (el && el !== document.body) {
        let oy = "";
        try { oy = getComputedStyle(el).overflowY; } catch (e) {}
        if ((oy === "auto" || oy === "scroll" || oy === "overlay") && el.scrollHeight > el.clientHeight + 40) return el;
        el = el.parentElement;
      }
    }
    const cands = [...document.querySelectorAll(SEL.scroll)]
      .filter(e => e.offsetParent !== null && e.scrollHeight > e.clientHeight + 40);
    cands.sort((a, b) => b.clientHeight - a.clientHeight);
    return cands[0] || document.scrollingElement || document.body;
  };
  // Scroll a target up/down and nudge the page + fire scroll, to trigger lazy loaders.
  function scrollBy(sc, dy) {
    sc.scrollTop = Math.max(0, Math.min(sc.scrollHeight, sc.scrollTop + dy));
    try { window.scrollBy(0, dy); } catch (e) {}
    [sc, window, document].forEach(t => { try { t.dispatchEvent(new Event("scroll", { bubbles: true })); } catch (e) {} });
  }
  const inPanel = (el) => !!(el && el.closest && el.closest("#fc-panel"));

  // Your message = timestamp aligned right ("margin-right"), or a right/own class.
  function isOwn(el) {
    if (inPanel(el)) return false;
    const cls = (el.className || "") + "";
    if (/\b(own|self|outgoing|sent|mine|owner)\b/i.test(cls)) return true;
    const wrap = el.getBoundingClientRect();
    if (wrap.width === 0) return false;
    // Find the message bubble (largest child that isn't full-width); your
    // messages are right-aligned, the other person's are left-aligned.
    let best = null, bestArea = 0;
    el.querySelectorAll("div,span,p").forEach(ch => {
      const r = ch.getBoundingClientRect();
      if (r.width < 24 || r.width > wrap.width * 0.9 || r.height === 0) return;
      const area = r.width * r.height;
      if (area > bestArea) { bestArea = area; best = r; }
    });
    const ref = best || wrap;
    return (ref.left + ref.width / 2) > (wrap.left + wrap.width / 2) + 4;
  }

  function byText(words) {
    const els = [...document.querySelectorAll("button,[role='button'],a,[class*='menu-item'],[class*='menuitem'],[class*='option'],[class*='action'],li")];
    for (const b of els) {
      if (inPanel(b) || b.offsetParent === null) continue;
      const txt = (b.textContent || "").trim().toLowerCase();
      if (txt && txt.length < 60 && words.some(w => txt === w || txt.includes(w))) return b;
    }
    return null;
  }

  async function scrollToTop() {
    const sc = scroller();
    let last = -1, stable = 0;
    for (let i = 0; i < 400; i++) {
      sc.scrollTop = 0;
      await sleep(450);
      const h = sc.scrollHeight;
      if (h === last) { if (++stable >= 2) return; } else { stable = 0; last = h; }
    }
  }

  function fire(el, type) {
    try { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true })); } catch (e) {}
    try { el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true })); } catch (e) {}
  }

  // Find the "Yes/Confirm/Delete" button in an "Are you sure?" dialog.
  // Searches modal/overlay scopes first and includes styled <div>/<span>
  // buttons; never clicks Cancel/No/Keep.
  function confirmBtn() {
    const words = ["yes", "confirm", "delete", "unsend", "remove", "ok"];
    const bad = /cancel|keep|don.?t|never|not now|no\b/i;
    const scopeSel = "[class*='modal'],[class*='dialog'],[role='dialog'],[role='alertdialog'],[class*='overlay'],[class*='confirm'],[class*='popup'],[class*='alert']";
    const cand = [];
    const collect = (root) => {
      root.querySelectorAll("button,[role='button'],a,[class*='btn'],[class*='button'],[class*='action'],[class*='confirm'],span,div").forEach(b => {
        if (inPanel(b) || b.offsetParent === null) return;
        const t = (b.textContent || "").trim();
        if (!t || t.length > 24 || bad.test(t)) return;
        const low = t.toLowerCase();
        if (words.some(w => low === w || low.startsWith(w))) cand.push(b);
      });
    };
    [...document.querySelectorAll(scopeSel)].filter(e => !inPanel(e) && e.offsetParent !== null).forEach(collect);
    if (!cand.length) collect(document);
    cand.sort((a, b) => a.textContent.trim().length - b.textContent.trim().length);
    return cand[0] || null;
  }

  function modalOpen() {
    return [...document.querySelectorAll("[role='dialog'],[role='alertdialog'],[class*='modal'],[class*='overlay'],[class*='popup']")]
      .some(e => !inPanel(e) && e.offsetParent !== null);
  }
  async function dismiss() {
    try { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } catch (e) {}
    for (let i = 0; i < 8; i++) { if (!modalOpen()) return; await sleep(250); }
  }

  async function deleteMsg(el) {
    try { el.scrollIntoView({ block: "center" }); } catch (e) {}
    // Open the message's menu (tap + hover) and wait for a Delete/Unsend option.
    fire(el, "pointerover"); fire(el, "mouseover");
    fire(el, "pointerdown"); fire(el, "mousedown"); fire(el, "pointerup"); fire(el, "mouseup");
    try { el.click(); } catch (e) {}
    let b = await waitFor(() => el.querySelector(SEL.del) || byText(["delete", "unsend"]), 1000, 60);
    if (!b) {
      const m = el.querySelector(SEL.menu);
      if (m) { try { m.click(); } catch (e) {} b = await waitFor(() => el.querySelector(SEL.del) || byText(["delete", "unsend"]), 700, 60); }
    }
    if (!b) { fire(el, "contextmenu"); b = await waitFor(() => byText(["delete", "unsend"]), 700, 60); }
    if (!b) return false;
    try { b.click(); } catch (e) { return false; }
    // Click the "Are you sure?" Yes as soon as it appears (or stop if already gone).
    const c = await waitFor(() => (!el.isConnected ? "GONE" : confirmBtn()), 1500, 60);
    if (c && c !== "GONE") { try { c.click(); } catch (e) {} }
    await waitFor(() => !el.isConnected, 1500, 60);
    return !el.isConnected;
  }

  function classOf(el) {
    if (!el) return "-";
    const c = ((el.className || "") + "").trim().replace(/\s+/g, ".");
    return el.tagName.toLowerCase() + (c ? "." + c : "");
  }
  function listButtons() {
    let s = "", seen = new Set(), n = 0;
    [...document.querySelectorAll("button,[role='button'],[class*='menu-item'],[class*='menuitem'],[class*='option'],[class*='action'],[aria-label],li")].forEach(b => {
      if (inPanel(b) || b.offsetParent === null) return;
      const lab = ((b.getAttribute && (b.getAttribute("aria-label") || b.getAttribute("title"))) || b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 26);
      if (!lab || seen.has(lab)) return; seen.add(lab);
      if (n < 24) { s += " b:" + lab + "\n"; n++; }
    });
    return s || " (none)\n";
  }
  async function diag() {
    let out = "=DIAG2=\n";
    // Scroll test: does scrolling up load more messages?
    const sc = scroller();
    const n0 = document.querySelectorAll(SEL.message).length;
    out += "scroller " + classOf(sc).slice(0, 34) + "\n";
    out += "  sH" + Math.round(sc.scrollHeight) + " cH" + Math.round(sc.clientHeight) + " top" + Math.round(sc.scrollTop) + " n=" + n0 + "\n";
    for (let i = 0; i < 6; i++) { scrollBy(sc, -Math.max(120, sc.clientHeight * 0.6)); await sleep(500); }
    out += "  after up: top" + Math.round(sc.scrollTop) + " sH" + Math.round(sc.scrollHeight) + " n=" + document.querySelectorAll(SEL.message).length + "\n";
    const wr = [...document.querySelectorAll(SEL.message)];
    out += "wrappers " + wr.length + " (own " + wr.filter(isOwn).length + ")\n";
    const sample = wr.slice(0, 4).concat(wr.slice(-2));
    sample.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const ts = el.querySelector("[class*='margin-right'],[class*='margin-left']");
      out += "#" + i + " " + classOf(el).slice(0, 46) + "\n";
      out += "  L" + Math.round(r.left) + " W" + Math.round(r.width) + " ts:" + (ts ? classOf(ts).slice(0, 24) : "-") + "\n";
      out += '  "' + (el.textContent || "").trim().slice(0, 28) + '"\n';
    });
    out += "[tap probe]\n";
    const t = wr[wr.length - 1];
    if (t) {
      ["pointerover", "pointerdown", "pointerup", "mousedown", "mouseup"].forEach(ev => fire(t, ev));
      try { t.click(); } catch (e) {}
      await sleep(600);
      out += listButtons();
      out += "[longpress probe]\n";
      fire(t, "contextmenu"); await sleep(600);
      out += listButtons();
    } else out += " no wrapper\n";
    return out;
  }

  function chatName() {
    const h = document.querySelector("[class*='display-name'],[class*='chat-header'],[class*='conversation-header'],[class*='thread-header'],header");
    const t = h ? (h.innerText || "").trim().split("\n")[0] : "";
    return (t || "fansly-chat").replace(/[^\w .-]+/g, "").slice(0, 40).trim() || "fansly-chat";
  }
  function saveFile(name, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} a.remove(); }, 2000);
    return url;
  }
  // Walk from the very top to the bottom, collecting messages as they render
  // (Fansly only keeps a window in the DOM, so one snapshot misses most).
  async function exportChat(onProgress) {
    const sc = scroller();
    const name = chatName();
    const key = "fcExp:" + (location.pathname || name);   // URL is stable across reloads; name isn't loaded yet after one
    let saved = { rows: [] };
    try { saved = JSON.parse(localStorage.getItem(key) || '{"rows":[]}'); } catch (e) {}
    const rows = saved.rows || [];
    const seen = new Set(rows.map(r => r.who + "|" + r.txt + "|" + (r.media || []).join(",")));
    const persist = () => { try { localStorage.setItem(key, JSON.stringify({ rows })); } catch (e) {} };
    const grab = () => {
      const batch = [];
      const wraps = [...document.querySelectorAll(SEL.message)];
      wraps.forEach(el => {
        const who = isOwn(el) ? "Me" : "Them";
      let txt = (el.innerText || "").replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();
        const media = [];
        el.querySelectorAll("img,video,source").forEach(m => {
          const u2 = m.currentSrc || m.getAttribute("src") || m.getAttribute("poster");
          if (u2 && !/avatar|profile|emoji/i.test(u2) && media.indexOf(u2) < 0) media.push(u2);
        });
        if (!txt && !media.length) return;
        const k = who + "|" + txt + "|" + media.join(",");
        if (!seen.has(k)) { seen.add(k); batch.push({ who, txt, media }); }
      });
      // Newly seen messages are older than everything collected so far → put them first.
      if (batch.length) { rows.unshift(...batch); persist(); }
      // Keep memory low so iOS doesn't reload the tab: we're crawling upward, so
      // messages now well below the viewport are already saved — remove them from
      // the page entirely; blank media on the rest.
      const vh = sc.clientHeight || window.innerHeight || 700;
      wraps.forEach(el => {
        try {
          if (el.getBoundingClientRect().top > vh * 1.5) { el.remove(); return; }
          el.querySelectorAll("img,video,source").forEach(m => { m.removeAttribute("srcset"); m.removeAttribute("src"); m.removeAttribute("poster"); });
        } catch (e) {}
      });
    };
    // Single upward crawl from the bottom, saving to the phone as we go so a
    // page reload just resumes instead of losing everything.
    sc.scrollTop = sc.scrollHeight; await sleep(180); grab();
    let stall = 0;
    for (let i = 0; i < 40000; i++) {
      const before = rows.length;
      scrollBy(sc, -Math.max(200, sc.clientHeight * 0.9));   // big jumps = fewer steps
      await sleep(170);                                       // short wait per step
      grab();
      if (onProgress && i % 3 === 0) onProgress("Saved " + rows.length + " messages so far (keep screen on)…");
      if (sc.scrollTop <= 2 && rows.length === before) {
        await sleep(500); grab();                            // near the top: give the loader a moment before concluding
        if (rows.length === before) { if (++stall >= 4) break; } else stall = 0;
      } else stall = 0;
    }
    let out = "Fansly chat export\nChat: " + name + "\nExported: " + new Date().toString() +
      "\nMessages: " + rows.length + "\n" + "=".repeat(40) + "\n\n";
    rows.forEach(r => {
      let line = r.txt;
      if (r.media && r.media.length) line += (line ? "\n" : "") + "[media] " + r.media.join("\n[media] ");
      out += "[" + r.who + "] " + line + "\n\n";
    });
    return { out, count: rows.length, name, key };
  }

  // ---- Panel ----
  const old = document.getElementById("fc-panel");
  if (old) old.remove();
  const panel = document.createElement("div");
  panel.id = "fc-panel";
  panel.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;" +
    "background:#1a1209;color:#f2e8d5;font:15px -apple-system,sans-serif;padding:14px;" +
    "border:1px solid #c8a951;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.6);";
  const bs = "flex:1;min-width:64px;padding:12px 8px;border-radius:8px;border:0;font:600 14px -apple-system,sans-serif;";
  panel.innerHTML =
    "<div style='font-weight:700;margin-bottom:6px;'>Fansly cleaner</div>" +
    "<div id='fc-status' style='margin:6px 0;font-size:12px;white-space:pre-wrap;max-height:55vh;overflow:auto;min-height:18px;'>Tap Scan to begin.</div>" +
    "<div style='display:flex;gap:6px;flex-wrap:wrap;'>" +
      "<button id='fc-scan' style='" + bs + "background:#c8a951;color:#1a1209;'>Scan</button>" +
      "<button id='fc-export' style='" + bs + "background:#2f6b3d;color:#fff;'>Export</button>" +
      "<button id='fc-del' style='" + bs + "background:#6b1c23;color:#fff;display:none;'>Delete all mine</button>" +
      "<button id='fc-debug' style='" + bs + "background:#3d2817;color:#f2e8d5;'>Debug</button>" +
      "<button id='fc-close' style='" + bs + "background:#3d2817;color:#f2e8d5;'>Close</button>" +
    "</div>";
  document.body.appendChild(panel);

  const q = (id) => panel.querySelector(id);
  const status = (m) => { q("#fc-status").textContent = m; };

  q("#fc-close").addEventListener("click", () => panel.remove());

  q("#fc-debug").addEventListener("click", async () => {
    status("Probing…");
    await scrollToTop();
    const text = await diag();
    try { await navigator.clipboard.writeText(text); status("COPIED — paste to the assistant.\n\n" + text); }
    catch (e) { status("(Screenshot this)\n\n" + text); }
  });

  q("#fc-export").addEventListener("click", async () => {
    q("#fc-export").disabled = true;
    status("Exporting… saves as it goes, so if the page reloads just tap Export again to resume.");
    const { out, count, name, key } = await exportChat(msg => status(msg));
    saveFile("fansly-" + name.replace(/\s+/g, "_") + ".txt", out);
    let copied = false;
    try { await navigator.clipboard.writeText(out); copied = true; } catch (e) {}
    try { localStorage.removeItem(key); } catch (e) {}   // finished — clear the saved progress
    status("Exported " + count + " messages to a file (fansly-" + name.replace(/\s+/g, "_") + ".txt)." +
      (copied ? "\nAlso copied to your clipboard as a backup." : "") +
      "\nIf no save prompt appeared, paste the clipboard copy into Notes.");
    q("#fc-export").disabled = false;
  });

  q("#fc-scan").addEventListener("click", async () => {
    q("#fc-scan").disabled = true;
    status("Loading history…");
    await scrollToTop();
    const msgs = [...document.querySelectorAll(SEL.message)];
    const mine = msgs.filter(isOwn).length;
    status("This chat — messages: " + msgs.length + "\nYours: " + mine +
      "\n\nTap ‘Delete all mine’ to remove YOUR messages. It stops on its own when none remain.");
    q("#fc-scan").disabled = false;
    q("#fc-del").style.display = "";
  });

  let armed = false, armTimer = null;
  q("#fc-del").addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      q("#fc-del").textContent = "Tap again to CONFIRM";
      status("This permanently deletes YOUR messages in this chat. Tap the red button again within 4s to start.");
      armTimer = setTimeout(() => { armed = false; q("#fc-del").textContent = "Delete all mine"; }, 4000);
      return;
    }
    clearTimeout(armTimer); armed = false;
    q("#fc-del").textContent = "Deleting…";
    q("#fc-del").disabled = true; q("#fc-scan").disabled = true;

    // Delete the bottom-most of your messages (usually already in view), then
    // the next, etc. Only scroll up to load older ones when none are left in view.
    let done = 0, stuck = 0;
    for (let guard = 0; guard < 20000; guard++) {
      const owns = [...document.querySelectorAll(SEL.message)].filter(isOwn);
      let deleted = false;
      if (owns.length) {
        for (let k = owns.length - 1, tries = 0; k >= 0 && tries < 4; k--, tries++) {
          const before = document.querySelectorAll(SEL.message).length;
          await deleteMsg(owns[k]);
          if (modalOpen()) await dismiss();
          if (document.querySelectorAll(SEL.message).length < before) { done++; deleted = true; status("Deleted " + done + "…"); break; }
        }
      }
      if (deleted) { stuck = 0; continue; }
      // Nothing deletable in view — try to load older messages.
      const sc = scroller();
      const beforeH = sc.scrollHeight;
      sc.scrollTop = 0;
      await sleep(350);
      if (sc.scrollHeight !== beforeH) { stuck = 0; continue; }   // new history loaded, retry
      if (++stuck >= 2) {
        const left = [...document.querySelectorAll(SEL.message)].filter(isOwn).length;
        status(left
          ? "Stopped after " + done + ". " + left + " of your messages couldn't be deleted — tell the assistant the exact text on the confirm popup's button."
          : "Done. Deleted " + done + " message(s).");
        break;
      }
    }
    q("#fc-del").disabled = false; q("#fc-scan").disabled = false; q("#fc-del").textContent = "Delete all mine";
  });
})();
