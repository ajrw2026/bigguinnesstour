/*
 * Fansly message cleaner — iPhone / Safari bookmarklet (source)
 *
 * Deletes ALL of YOUR messages in the currently-open chat (no date filter).
 * In-page panel (iOS blocks prompt/confirm/alert). Buttons:
 *   Scan            – load history, count messages and how many are yours
 *   Delete all mine – (tap twice to confirm) delete your messages, oldest first
 *   Debug           – copy page structure to clipboard if something's off
 *   Close           – remove the panel
 *
 * One-line version to paste into a bookmark: bookmarklet.txt
 */
(async () => {
  "use strict";

  const SEL = {
    scroll: "[class*='message-list'],[class*='messages'],[class*='thread'],[class*='conversation']",
    message: "[class*='message-item'],[class*='chat-message'],[class*='message-bubble'],[class*='message']",
    del: "button[aria-label*='delete' i],[title*='delete' i],[class*='delete'],[class*='trash']",
    menu: "button[aria-label*='more' i],button[aria-label*='option' i],[class*='more-option'],[class*='msg-menu']"
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const scroller = () => document.querySelector(SEL.scroll) || document.scrollingElement || document.body;
  const inPanel = (el) => !!(el.closest && el.closest("#fc-panel"));

  function isOwn(el) {
    if (inPanel(el)) return false;
    const cls = (el.className || "") + "";
    if (/\b(own|self|outgoing|sent|mine|owner)\b/i.test(cls)) return true;
    const sc = scroller().getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.width === 0) return false;
    return (r.left + r.width / 2) > (sc.left + sc.width / 2);
  }

  // Find a button/menu item by text — never inside our own panel.
  function byText(words) {
    const btns = [...document.querySelectorAll("button,[role='button'],a,[class*='menu-item'],[class*='menuitem'],li")];
    for (const b of btns) {
      if (inPanel(b) || b.offsetParent === null) continue;
      const txt = (b.textContent || "").trim().toLowerCase();
      if (txt && txt.length < 24 && words.some(w => txt === w || txt.includes(w))) return b;
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

  // Try hard to delete one message: hover reveal, tap-to-open-menu, long-press.
  async function deleteMsg(el) {
    try { el.scrollIntoView({ block: "center" }); } catch (e) {}
    await sleep(150);
    fire(el, "pointerover"); fire(el, "mouseover"); fire(el, "mousemove");
    await sleep(150);
    let b = el.querySelector(SEL.del);
    if (!b) {
      fire(el, "pointerdown"); fire(el, "mousedown");
      fire(el, "pointerup"); fire(el, "mouseup");
      try { el.click(); } catch (e) {}
      await sleep(400);
      b = el.querySelector(SEL.del) || byText(["delete"]);
    }
    if (!b) {
      const m = el.querySelector(SEL.menu);
      if (m) { try { m.click(); } catch (e) {} await sleep(400); b = el.querySelector(SEL.del) || byText(["delete"]); }
    }
    if (!b) { fire(el, "contextmenu"); await sleep(400); b = byText(["delete"]); }
    if (!b) return false;
    try { b.click(); } catch (e) { return false; }
    await sleep(400);
    const c = byText(["delete", "confirm", "yes", "remove"]);
    if (c) { try { c.click(); } catch (e) {} await sleep(400); }
    return true;
  }

  function classOf(el) {
    if (!el) return "-";
    const c = ((el.className || "") + "").trim().replace(/\s+/g, ".");
    return el.tagName.toLowerCase() + (c ? "." + c : "");
  }
  async function diag() {
    const cts = ["message-item", "chat-message", "message-bubble", "message-wrapper",
      "message-row", "message-group", "message-content", "message", "chat"];
    let out = "=FANSLY DIAG=\n";
    cts.forEach(c => {
      const els = [...document.querySelectorAll("[class*='" + c + "']")];
      out += "*" + c + " " + els.length + " (own " + els.filter(isOwn).length + ")\n";
    });
    const re = /\b\d{1,2}:\d{2}\b/;
    const hits = [...document.querySelectorAll("span,div,time,small,p")].filter(el => {
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("");
      return re.test(own);
    });
    out += "time-els " + hits.length + "\n";
    hits.slice(-2).forEach((el, i) => {
      out += "[" + i + "] " + (el.textContent || "").trim().slice(0, 40) + "\n";
      let a = el, lvl = 0;
      while (a && lvl < 6) {
        out += "  " + lvl + " " + classOf(a).slice(0, 58) + " w" + Math.round(a.getBoundingClientRect().width) + "\n";
        a = a.parentElement; lvl++;
      }
    });
    // Probe: tap the last message-ish element and list the menu options that appear.
    out += "[menu probe]\n";
    let tgt = null;
    if (hits.length) {
      let a = hits[hits.length - 1];
      for (let i = 0; i < 6 && a; i++) { if (/message/i.test((a.className || "") + "")) { tgt = a; break; } a = a.parentElement; }
      if (!tgt) tgt = hits[hits.length - 1].parentElement;
    }
    if (tgt) {
      fire(tgt, "pointerover"); fire(tgt, "pointerdown"); fire(tgt, "pointerup"); try { tgt.click(); } catch (e) {}
      await sleep(500);
      const seen = new Set(); let n = 0;
      [...document.querySelectorAll("button,[role='button'],[class*='menu-item'],[class*='option'],[aria-label]")].forEach(b => {
        if (inPanel(b) || b.offsetParent === null) return;
        const lab = ((b.getAttribute && (b.getAttribute("aria-label") || b.getAttribute("title"))) || b.textContent || "").trim().slice(0, 26);
        if (!lab || seen.has(lab)) return; seen.add(lab);
        if (n < 20) { out += "  b:" + lab + "\n"; n++; }
      });
    } else out += "  (no target)\n";
    return out;
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
    "<div style='display:flex;gap:6px;'>" +
      "<button id='fc-scan' style='" + bs + "background:#c8a951;color:#1a1209;'>Scan</button>" +
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

  q("#fc-scan").addEventListener("click", async () => {
    q("#fc-scan").disabled = true;
    status("Loading history…");
    await scrollToTop();
    const msgs = [...document.querySelectorAll(SEL.message)];
    const mine = msgs.filter(isOwn).length;
    status("Loaded: " + msgs.length + "\nYours (estimate): " + mine +
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

    let done = 0, noProgressPasses = 0;
    const maxPasses = 2000;
    for (let pass = 0; pass < maxPasses; pass++) {
      await scrollToTop();
      const owns = [...document.querySelectorAll(SEL.message)].filter(isOwn);
      if (!owns.length) break;
      let progressed = false, attempts = 0;
      for (const el of owns) {
        if (attempts++ >= 20) break;
        const before = document.querySelectorAll(SEL.message).length;
        const ok = await deleteMsg(el);
        await sleep(500);
        const after = document.querySelectorAll(SEL.message).length;
        if (ok && after < before) { done++; progressed = true; status("Deleted " + done + "…"); break; }
      }
      if (progressed) noProgressPasses = 0;
      else if (++noProgressPasses >= 2) {
        status("Stopped after deleting " + done + ".\nAny left may not have a delete option, or the button couldn't be found. Tap Debug and send it over.");
        q("#fc-del").disabled = false; q("#fc-scan").disabled = false;
        q("#fc-del").textContent = "Delete all mine";
        return;
      }
    }
    status("Done. Deleted " + done + " message(s).");
    q("#fc-del").disabled = false; q("#fc-scan").disabled = false;
    q("#fc-del").textContent = "Delete all mine";
  });
})();
