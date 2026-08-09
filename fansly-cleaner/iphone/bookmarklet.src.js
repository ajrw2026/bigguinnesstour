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
  const scroller = () => document.querySelector(SEL.scroll) || document.scrollingElement || document.body;
  const inPanel = (el) => !!(el && el.closest && el.closest("#fc-panel"));

  // Your message = timestamp aligned right ("margin-right"), or a right/own class.
  function isOwn(el) {
    if (inPanel(el)) return false;
    const cls = (el.className || "") + "";
    if (/\b(own|self|outgoing|sent|mine|owner)\b/i.test(cls)) return true;
    if (el.querySelector("[class*='margin-right']")) return true;
    if (el.querySelector("[class*='margin-left']")) return false;
    const sc = scroller().getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.width === 0) return false;
    return (r.left + r.width / 2) > (sc.left + sc.width / 2);
  }

  function byText(words) {
    const els = [...document.querySelectorAll("button,[role='button'],a,[class*='menu-item'],[class*='menuitem'],[class*='option'],[class*='action'],li")];
    for (const b of els) {
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
        if (!t || t.length > 16 || bad.test(t)) return;
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
    await sleep(150);
    fire(el, "pointerover"); fire(el, "mouseover"); fire(el, "mousemove");
    await sleep(150);
    let b = el.querySelector(SEL.del);
    if (!b) {
      fire(el, "pointerdown"); fire(el, "mousedown"); fire(el, "pointerup"); fire(el, "mouseup");
      try { el.click(); } catch (e) {}
      await sleep(450);
      b = el.querySelector(SEL.del) || byText(["delete", "unsend"]);
    }
    if (!b) {
      const m = el.querySelector(SEL.menu);
      if (m) { try { m.click(); } catch (e) {} await sleep(450); b = el.querySelector(SEL.del) || byText(["delete", "unsend"]); }
    }
    if (!b) { fire(el, "contextmenu"); await sleep(450); b = byText(["delete", "unsend"]); }
    if (!b) return false;
    try { b.click(); } catch (e) { return false; }

    // Handle the "Are you sure?" confirmation: poll up to ~4s for its Yes button.
    for (let k = 0; k < 13; k++) {
      if (!el.isConnected) return true;            // deleted without a confirm
      const c = confirmBtn();
      if (c) { try { c.click(); } catch (e) {} await sleep(600); return true; }
      await sleep(300);
    }
    return true;
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

    await scrollToTop();          // load history once, not every pass (that caused the jumping)
    let done = 0, noProg = 0;
    for (let pass = 0; pass < 5000; pass++) {
      let owns = [...document.querySelectorAll(SEL.message)].filter(isOwn);
      if (!owns.length) {
        // none rendered — nudge scroll up to load/render older messages
        const sc = scroller();
        sc.scrollTop = Math.max(0, sc.scrollTop - 2500);
        await sleep(700);
        owns = [...document.querySelectorAll(SEL.message)].filter(isOwn);
        if (!owns.length) { sc.scrollTop = 0; await sleep(700); owns = [...document.querySelectorAll(SEL.message)].filter(isOwn); }
        if (!owns.length) break;
      }
      let progressed = false, attempts = 0;
      for (const el of owns) {
        if (attempts++ >= 8) break;
        const before = document.querySelectorAll(SEL.message).length;
        await deleteMsg(el);
        await dismiss();
        await sleep(350);
        const after = document.querySelectorAll(SEL.message).length;
        if (after < before) { done++; progressed = true; status("Deleted " + done + "…"); break; }
      }
      if (progressed) noProg = 0;
      else if (++noProg >= 3) {
        status("Stopped after deleting " + done + ".\nRemaining ones couldn't be deleted — tell the assistant the exact text on the confirm popup's button.");
        q("#fc-del").disabled = false; q("#fc-scan").disabled = false; q("#fc-del").textContent = "Delete all mine";
        return;
      }
    }
    status("Done. Deleted " + done + " message(s).");
    q("#fc-del").disabled = false; q("#fc-scan").disabled = false; q("#fc-del").textContent = "Delete all mine";
  });
})();
