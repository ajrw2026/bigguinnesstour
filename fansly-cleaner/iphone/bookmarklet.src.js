/*
 * Fansly message cleaner — iPhone / Safari bookmarklet (source)
 *
 * In-page panel (iOS blocks prompt/confirm/alert). Buttons:
 *   Debug   – dump the page structure to the clipboard so selectors can be fixed
 *   Preview – load history, show what WOULD be deleted (nothing yet)
 *   Delete  – delete YOUR messages oldest-first up to the chosen date
 *   Close   – remove the panel
 *
 * One-line version to paste into a bookmark: bookmarklet.txt
 */
(async () => {
  "use strict";

  const SEL = {
    scroll: "[class*='message-list'],[class*='messages'],[class*='thread'],[class*='conversation']",
    message: "[class*='message-item'],[class*='chat-message'],[class*='message-bubble'],[class*='message']",
    time: "time,[datetime],[title],[aria-label]",
    dateSep: "[class*='date-separator'],[class*='day-separator'],[class*='date-divider'],[class*='date-header']",
    del: "button[aria-label*='delete' i],[title*='delete' i],[class*='delete'],[class*='trash']",
    menu: "button[aria-label*='more' i],button[aria-label*='option' i],[class*='more-option'],[class*='msg-menu']"
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const scroller = () => document.querySelector(SEL.scroll) || document.scrollingElement || document.body;

  function isOwn(el) {
    const cls = (el.className || "") + "";
    if (/\b(own|self|outgoing|sent|mine|owner)\b/i.test(cls)) return true;
    const sc = scroller().getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.width === 0) return false;
    return (r.left + r.width / 2) > (sc.left + sc.width / 2);
  }

  function dateOf(el) {
    const t = el.querySelector(SEL.time);
    if (t) {
      const raw = t.getAttribute("datetime") || t.getAttribute("title") || t.getAttribute("aria-label");
      if (raw) { const d = new Date(raw); if (!isNaN(d)) return d; }
    }
    const y = el.getBoundingClientRect().top;
    let label = null;
    document.querySelectorAll(SEL.dateSep).forEach(s => {
      if (s.getBoundingClientRect().top <= y) label = (s.textContent || "").trim();
    });
    if (!label) return null;
    const low = label.toLowerCase();
    const now = new Date();
    if (low === "today") return now;
    if (low === "yesterday") return new Date(now.getTime() - 864e5);
    const d = new Date(label);
    return isNaN(d) ? null : d;
  }

  function byText(words) {
    const btns = [...document.querySelectorAll("button,[role='button'],a,[class*='menu-item']")];
    for (const b of btns) {
      const txt = (b.textContent || "").trim().toLowerCase();
      if (txt && words.some(w => txt === w || txt.includes(w)) && b.offsetParent !== null) return b;
    }
    return null;
  }

  async function scrollToTop() {
    const sc = scroller();
    let last = -1, stable = 0;
    for (let i = 0; i < 400; i++) {
      sc.scrollTop = 0;
      await sleep(500);
      const h = sc.scrollHeight;
      if (h === last) { if (++stable >= 2) return; } else { stable = 0; last = h; }
    }
  }

  function fire(el, type) {
    try { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true })); } catch (e) {}
    try { el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true })); } catch (e) {}
  }

  async function deleteMsg(el) {
    try { el.scrollIntoView({ block: "center" }); } catch (e) {}
    await sleep(150);
    fire(el, "mouseover"); fire(el, "pointerover"); fire(el, "mousemove");
    await sleep(150);
    let b = el.querySelector(SEL.del);
    if (!b) {
      const m = el.querySelector(SEL.menu);
      if (m) { m.click(); await sleep(350); b = el.querySelector(SEL.del) || byText(["delete"]); }
    }
    if (!b) { fire(el, "contextmenu"); await sleep(350); b = byText(["delete"]); }
    if (!b) return false;
    b.click();
    await sleep(350);
    const c = byText(["delete", "confirm", "yes"]);
    if (c) { c.click(); await sleep(350); }
    return true;
  }

  // ---- Diagnostic: describe the page so selectors/date-parsing can be fixed ----
  function classOf(el) {
    if (!el) return "-";
    const c = ((el.className || "") + "").trim().replace(/\s+/g, ".");
    return el.tagName.toLowerCase() + (c ? "." + c : "");
  }
  function diag() {
    const cands = ["message-item", "chat-message", "message-bubble", "message-wrapper",
      "message-row", "message-group", "message-content", "message"];
    let out = "=== FANSLY DIAGNOSTIC ===\npath " + location.pathname + "\n[class counts]\n";
    cands.forEach(c => { out += " *" + c + ": " + document.querySelectorAll("[class*='" + c + "']").length + "\n"; });
    const re = /\b\d{1,2}:\d{2}\b/;
    const all = [...document.querySelectorAll("span,div,time,small,p")];
    const hits = all.filter(el => {
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("");
      return re.test(own);
    });
    out += "[time-like text els] " + hits.length + "\n";
    hits.slice(-4).forEach(el => {
      out += "• " + classOf(el) + ' t="' + (el.textContent || "").trim().slice(0, 50) + '"\n';
      ["datetime", "title", "aria-label"].forEach(a => {
        const v = el.getAttribute && el.getAttribute(a);
        if (v) out += "   @" + a + "=" + v.slice(0, 50) + "\n";
      });
      out += "   ^ " + classOf(el.parentElement) + "\n";
      out += "   ^^ " + classOf(el.parentElement && el.parentElement.parentElement) + "\n";
      out += "   ^^^ " + classOf(el.parentElement && el.parentElement.parentElement && el.parentElement.parentElement.parentElement) + "\n";
    });
    return out;
  }

  // ---- Build the in-page control panel ----
  const old = document.getElementById("fc-panel");
  if (old) old.remove();

  const panel = document.createElement("div");
  panel.id = "fc-panel";
  panel.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;" +
    "background:#1a1209;color:#f2e8d5;font:15px -apple-system,sans-serif;padding:14px;" +
    "border:1px solid #c8a951;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.6);";
  const btn = "flex:1;min-width:70px;padding:12px;border-radius:8px;border:0;font:600 15px -apple-system,sans-serif;";
  panel.innerHTML =
    "<div style='font-weight:700;margin-bottom:8px;'>Fansly cleaner</div>" +
    "<div style='font-size:13px;margin-bottom:4px;'>Delete my messages on/before:</div>" +
    "<input id='fc-date' type='date' style='width:100%;padding:10px;border-radius:8px;border:1px solid #c8a951;background:#2b1a0e;color:#f2e8d5;font-size:16px;box-sizing:border-box;'>" +
    "<div id='fc-status' style='margin:10px 0;font-size:12px;white-space:pre-wrap;max-height:40vh;overflow:auto;'></div>" +
    "<div style='display:flex;gap:8px;'>" +
      "<button id='fc-debug' style='" + btn + "background:#3d2817;color:#f2e8d5;'>Debug</button>" +
      "<button id='fc-preview' style='" + btn + "background:#c8a951;color:#1a1209;'>Preview</button>" +
      "<button id='fc-delete' style='" + btn + "background:#6b1c23;color:#fff;display:none;'>Delete</button>" +
      "<button id='fc-close' style='" + btn + "background:#3d2817;color:#f2e8d5;'>Close</button>" +
    "</div>";
  document.body.appendChild(panel);

  const q = (id) => panel.querySelector(id);
  const status = (m) => { q("#fc-status").textContent = m; };
  const dateInput = q("#fc-date");
  dateInput.value = localStorage.getItem("fcCutoff") || "";

  let cutoff = null, target = [];

  q("#fc-close").addEventListener("click", () => panel.remove());

  q("#fc-debug").addEventListener("click", async () => {
    status("Loading a bit of history for the probe…");
    await scrollToTop();
    const text = diag();
    status(text);
    try { await navigator.clipboard.writeText(text); status("COPIED to clipboard — paste it to the assistant.\n\n" + text); }
    catch (e) { status("(Couldn't auto-copy — screenshot this)\n\n" + text); }
  });

  q("#fc-preview").addEventListener("click", async () => {
    const raw = dateInput.value;
    if (!raw) { status("Pick a date first."); return; }
    localStorage.setItem("fcCutoff", raw);
    cutoff = new Date(raw + "T23:59:59");
    q("#fc-preview").disabled = true;
    status("Loading history…");
    await scrollToTop();
    const msgs = [...document.querySelectorAll(SEL.message)];
    const mine = msgs.filter(isOwn);
    target = mine.filter(el => { const d = dateOf(el); return d && d <= cutoff; });
    const unknown = mine.filter(el => !dateOf(el)).length;
    status("Loaded: " + msgs.length + "\nYours: " + mine.length +
      "\nWill delete (on/before " + raw + "): " + target.length +
      (unknown ? "\nUnknown date, skipped: " + unknown : ""));
    q("#fc-preview").disabled = false;
    const db = q("#fc-delete");
    if (target.length) { db.style.display = ""; db.textContent = "Delete " + target.length; }
    else db.style.display = "none";
  });

  q("#fc-delete").addEventListener("click", async () => {
    if (!cutoff || !target.length) return;
    q("#fc-delete").disabled = true;
    q("#fc-preview").disabled = true;
    let done = 0, stuck = 0;
    const cap = target.length * 3 + 20;
    for (let i = 0; i < cap; i++) {
      await scrollToTop();
      const list = [...document.querySelectorAll(SEL.message)];
      let el = null;
      for (const m of list) {
        const d = dateOf(m);
        if (d && d > cutoff) break;
        if (isOwn(m) && d && d <= cutoff) { el = m; break; }
      }
      if (!el) break;
      if (await deleteMsg(el)) { done++; stuck = 0; status("Deleting… " + done + "/" + target.length); await sleep(700); }
      else if (++stuck >= 3) { status("Stuck — couldn't find the delete control 3x. Tap Debug and send it over."); break; }
    }
    status("Done. Deleted " + done + " message(s)." + (done < target.length ? "\nTap Preview, then Delete, to continue." : ""));
    q("#fc-delete").disabled = false;
    q("#fc-preview").disabled = false;
  });
})();
