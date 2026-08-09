/*
 * Fansly message cleaner — iPhone / Safari bookmarklet (source)
 *
 * Runs inside your own logged-in Fansly tab. Open the chat you want to clean,
 * then tap the bookmark. It previews what it found, asks you to confirm, then
 * deletes YOUR messages oldest-first up to a cutoff date.
 *
 * This is the readable source. The one-line version to paste into a bookmark
 * is in bookmarklet.txt (built from this file).
 */
(async () => {
  "use strict";

  // ---- Selectors (broad on purpose; edit if the preview finds nothing) ----
  const SEL = {
    scroll: "[class*='message-list'],[class*='messages'],[class*='thread'],[class*='conversation']",
    message: "[class*='message-item'],[class*='chat-message'],[class*='message-bubble'],[class*='message']",
    time: "time,[datetime],[title],[aria-label]",
    dateSep: "[class*='date-separator'],[class*='day-separator'],[class*='date-divider'],[class*='date-header']",
    del: "button[aria-label*='delete' i],[title*='delete' i],[class*='delete'],[class*='trash']",
    menu: "button[aria-label*='more' i],button[aria-label*='option' i],[class*='more-option'],[class*='msg-menu']"
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // ---- On-screen status box (iPhone has no console) ----
  let box = document.getElementById("fc-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "fc-box";
    box.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;" +
      "background:#1a1209;color:#f2e8d5;font:14px -apple-system,sans-serif;padding:12px 14px;" +
      "border:1px solid #c8a951;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.5);white-space:pre-wrap;";
    document.body.appendChild(box);
  }
  const say = (m) => { box.textContent = m; };

  const scroller = () => document.querySelector(SEL.scroll) || document.scrollingElement || document.body;

  // ---- Is this message MINE? class hint first, then right-side geometry ----
  function isOwn(el) {
    const cls = (el.className || "") + "";
    if (/\b(own|self|outgoing|sent|mine|owner)\b/i.test(cls)) return true;
    const sc = scroller().getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.width === 0) return false;
    return (r.left + r.width / 2) > (sc.left + sc.width / 2);
  }

  // ---- Date for a message: timestamp attr, else nearest date separator above ----
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
      if (txt && words.some(w => txt === w || txt.includes(w))) {
        if (b.offsetParent !== null) return b;
      }
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

  // ---- Ask for cutoff date ----
  const prev = localStorage.getItem("fcCutoff") || "";
  const raw = prompt("Delete YOUR messages up to and INCLUDING which date?\n(YYYY-MM-DD)", prev);
  if (!raw) { say("Cancelled."); return; }
  const cutoff = new Date(raw + "T23:59:59");
  if (isNaN(cutoff)) { alert("Couldn't read that date. Use YYYY-MM-DD."); return; }
  localStorage.setItem("fcCutoff", raw);

  say("Loading chat history…");
  await scrollToTop();

  // ---- Preview ----
  let msgs = [...document.querySelectorAll(SEL.message)];
  const mine = msgs.filter(isOwn);
  const target = mine.filter(el => { const d = dateOf(el); return d && d <= cutoff; });
  const unknown = mine.filter(el => !dateOf(el)).length;

  if (!confirm(
    "Found in this chat:\n" +
    "• messages loaded: " + msgs.length + "\n" +
    "• yours: " + mine.length + "\n" +
    "• yours on/before " + raw + ": " + target.length + "  (will delete)\n" +
    (unknown ? "• yours, date unknown: " + unknown + " (skipped)\n" : "") +
    "\nTap OK to DELETE them (permanent). Cancel to stop."
  )) { say("Cancelled — nothing deleted."); return; }

  if (target.length === 0) {
    alert("Nothing matched. If you know there are messages here, the selectors need tweaking — tell the assistant these numbers.");
    say("Nothing to delete.");
    return;
  }

  // ---- Delete loop: always the earliest qualifying, rescan each time ----
  let done = 0, stuck = 0;
  const cap = target.length * 3 + 20;
  for (let i = 0; i < cap; i++) {
    await scrollToTop();
    const list = [...document.querySelectorAll(SEL.message)];
    let el = null;
    for (const m of list) {
      const d = dateOf(m);
      if (d && d > cutoff) break;         // reached messages after cutoff
      if (isOwn(m) && d && d <= cutoff) { el = m; break; }
    }
    if (!el) break;
    const ok = await deleteMsg(el);
    if (ok) { done++; stuck = 0; say("Deleting… " + done + "/" + target.length); await sleep(700); }
    else { if (++stuck >= 3) { alert("Couldn't find the delete control. Tell the assistant so the selectors can be fixed."); break; } }
  }

  say("Done. Deleted " + done + " message(s).");
  alert("Done. Deleted " + done + " message(s)." + (done < target.length ? "\nRun again to continue." : ""));
})();
