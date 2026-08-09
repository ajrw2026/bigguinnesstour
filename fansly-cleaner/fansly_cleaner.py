#!/usr/bin/env python3
"""
Fansly message cleaner
======================

Interactively deletes YOUR OWN sent messages in a single Fansly chat, working
from the earliest message up to (and including) a cutoff date you choose.

It drives a real Chromium window with Playwright:
  1. You log in once, manually, in the opened window (handles captcha / 2FA).
     The login is remembered between runs in a local browser profile.
  2. You pick the chat (by typing the person's name, or by opening it yourself).
  3. You choose a cutoff date.
  4. It does a DRY RUN first and shows you exactly what it would delete.
  5. Only after you confirm does it click the trash-can on each of your
     messages, oldest first, until it reaches your cutoff date.

Nothing is deleted without an explicit "yes". Messages from the other person
are never touched, and messages whose date can't be determined are skipped
(and reported) rather than deleted.

Usage:
    python fansly_cleaner.py                 # normal interactive run
    python fansly_cleaner.py --inspect       # pause with the Playwright inspector
                                             #   to help you find/verify selectors
    python fansly_cleaner.py --headless      # not recommended (you must log in)

See README.md for setup and for how to fix selectors if the dry run looks wrong.
"""

import argparse
import json
import sys
import time
from datetime import datetime, date, time as dtime, timedelta
from pathlib import Path

try:
    from dateutil import parser as dateparser
except ImportError:
    print("Missing dependency 'python-dateutil'. Run: pip install -r requirements.txt")
    sys.exit(1)

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
except ImportError:
    print("Missing dependency 'playwright'. Run: pip install -r requirements.txt "
          "&& python -m playwright install chromium")
    sys.exit(1)


HERE = Path(__file__).resolve().parent
PROFILE_DIR = HERE / "browser-profile"   # persistent login lives here (git-ignored)


# --------------------------------------------------------------------------- #
#  Small console helpers
# --------------------------------------------------------------------------- #
def say(msg=""):
    print(msg, flush=True)


def ask(msg):
    try:
        return input(msg).strip()
    except (EOFError, KeyboardInterrupt):
        say("\nAborted.")
        sys.exit(0)


def ask_yes(msg, default=False):
    suffix = " [Y/n] " if default else " [y/N] "
    ans = ask(msg + suffix).lower()
    if not ans:
        return default
    return ans in ("y", "yes")


def load_selectors(path):
    with open(path, "r", encoding="utf-8") as fh:
        sel = json.load(fh)
    # drop comment/doc keys
    return {k: v for k, v in sel.items() if not k.startswith("_")}


# --------------------------------------------------------------------------- #
#  Date handling
# --------------------------------------------------------------------------- #
def resolve_dt(item, now):
    """
    Turn a scanned message's raw date/time hints into a datetime, or None if
    we can't be confident. We only ever compare by calendar date.
    """
    # 1) A machine-readable timestamp attribute (best case).
    iso = item.get("iso")
    if iso:
        try:
            return dateparser.parse(iso, fuzzy=True)
        except (ValueError, OverflowError, TypeError):
            pass

    # 2) A date-separator label ("Today", "Yesterday", "January 5, 2025", ...).
    dtext = (item.get("dateText") or "").strip()
    if not dtext:
        return None
    low = dtext.lower()
    if low == "today":
        return datetime.combine(now.date(), dtime.min)
    if low == "yesterday":
        return datetime.combine((now - timedelta(days=1)).date(), dtime.min)
    try:
        parsed = dateparser.parse(dtext, fuzzy=True, default=now)
        return datetime.combine(parsed.date(), dtime.min)
    except (ValueError, OverflowError, TypeError):
        return None


def parse_cutoff(raw):
    parsed = dateparser.parse(raw, fuzzy=True)
    return parsed.date()


# --------------------------------------------------------------------------- #
#  Page interaction
# --------------------------------------------------------------------------- #
# JS that reads every currently-rendered message. Returns them in document
# order (oldest first). Date separators are matched by nearest one above each
# message, so even the other person's messages get a date.
JS_SCAN = r"""
(sel) => {
  const q = (root, s) => { try { return root.querySelector(s); } catch (e) { return null; } };
  const qa = (root, s) => { try { return [...root.querySelectorAll(s)]; } catch (e) { return []; } };

  const seps = qa(document, sel.date_separator).map(e => ({
    y: e.getBoundingClientRect().top,
    text: (e.textContent || "").trim()
  }));
  const dateAbove = (y) => {
    let d = null;
    for (const s of seps) { if (s.y <= y) d = s.text; }
    return d;
  };

  const msgs = qa(document, sel.message);
  return msgs.map(m => {
    const rect = m.getBoundingClientRect();
    const t = q(m, sel.timestamp);
    let iso = null;
    if (t) {
      iso = t.getAttribute("datetime") || t.getAttribute("title")
            || t.getAttribute("aria-label") || null;
    }
    let isOwn = false;
    try { isOwn = m.matches(sel.own_message); } catch (e) { isOwn = false; }
    return {
      isOwn: isOwn,
      iso: iso,
      dateText: dateAbove(rect.top),
      text: ((m.innerText || "").trim()).slice(0, 140)
    };
  });
}
"""


def ensure_login(page, sel):
    say("Opening Fansly …")
    page.goto(sel["messages_url"], wait_until="domcontentloaded")
    time.sleep(2)
    if page.query_selector(sel["logged_in_indicator"]):
        say("Looks like you're already logged in.")
        return
    say("")
    say("  >> Please log in to Fansly in the browser window that just opened.")
    say("     (Complete any captcha / 2FA there.) Your login is remembered")
    say("     for next time in ./browser-profile.")
    ask("  Press Enter here once you're logged in and can see your messages … ")
    page.goto(sel["messages_url"], wait_until="domcontentloaded")
    time.sleep(2)


def open_chat(page, sel):
    say("")
    say("Which chat do you want to clean?")
    say("  • Type the person's display name or username to have the bot find it, or")
    say("  • just open the chat yourself in the browser window and leave this blank.")
    query = ask("Name (or blank to open it manually): ")

    if query:
        found = False
        for item in page.query_selector_all(sel["conversation_item"]):
            try:
                text = (item.inner_text() or "").strip()
            except Exception:
                continue
            if query.lower() in text.lower():
                item.scroll_into_view_if_needed()
                item.click()
                found = True
                break
        if found:
            time.sleep(2)
            say(f"Opened a conversation matching “{query}”.")
        else:
            say(f"Couldn't find “{query}” in the conversation list.")
            ask("Open the chat yourself in the browser, then press Enter here … ")
    else:
        ask("Open the chat in the browser window, then press Enter here … ")

    time.sleep(1)
    header = page.query_selector(sel["chat_header"])
    if header:
        try:
            say(f"Active chat: {header.inner_text().strip().splitlines()[0]}")
        except Exception:
            pass


def scroll_to_top(page, sel, max_rounds=400):
    """Scroll the message pane up until the earliest message is loaded."""
    container = page.query_selector(sel["scroll_container"])
    stable = 0
    last_height = -1
    for _ in range(max_rounds):
        if container:
            height = container.evaluate("el => { el.scrollTop = 0; return el.scrollHeight; }")
        else:
            # Fall back to window scrolling if we can't find the pane.
            height = page.evaluate("() => { window.scrollTo(0, 0); return document.body.scrollHeight; }")
        time.sleep(0.6)
        if height == last_height:
            stable += 1
            if stable >= 2:
                return
        else:
            stable = 0
            last_height = height
    say("  (Reached scroll limit while loading history — continuing with what loaded.)")


def scan_rendered(page, sel, now):
    raw = page.evaluate(JS_SCAN, sel)
    out = []
    for item in raw:
        out.append({
            "isOwn": bool(item.get("isOwn")),
            "dt": resolve_dt(item, now),
            "text": item.get("text") or "",
        })
    return out


def topmost_target_index(scanned, cutoff):
    """
    Index of the earliest of MY messages dated on/before the cutoff.
    Returns None when there's nothing left to delete. Stops at the first
    message dated after the cutoff (messages are chronological).
    """
    for i, m in enumerate(scanned):
        if m["dt"] is not None and m["dt"].date() > cutoff:
            return None
        if m["isOwn"] and m["dt"] is not None and m["dt"].date() <= cutoff:
            return i
    return None


def click_delete(page, msg_handle, sel):
    """Hover a message and click its trash-can / Delete, confirming if asked."""
    try:
        msg_handle.scroll_into_view_if_needed()
        msg_handle.hover()
    except Exception:
        return False
    time.sleep(0.3)

    btn = msg_handle.query_selector(sel["delete_button"])
    if not btn:
        # Some UIs hide Delete behind a "…" / more-options menu.
        menu = msg_handle.query_selector(sel["menu_button"])
        if menu:
            try:
                menu.click()
                time.sleep(0.4)
                btn = page.query_selector(sel["delete_menu_item"])
            except Exception:
                btn = None
    if not btn:
        return False

    try:
        btn.click()
    except Exception:
        return False
    time.sleep(0.4)

    # Optional confirmation dialog.
    try:
        confirm = page.query_selector(sel["confirm_button"])
        if confirm and confirm.is_visible():
            confirm.click()
    except Exception:
        pass
    time.sleep(0.4)
    return True


# --------------------------------------------------------------------------- #
#  Dry run report
# --------------------------------------------------------------------------- #
def dry_run_report(scanned, cutoff):
    own = [m for m in scanned if m["isOwn"]]
    deletable = [m for m in own if m["dt"] is not None and m["dt"].date() <= cutoff]
    unknown_own = [m for m in own if m["dt"] is None]

    say("")
    say("=" * 64)
    say("DRY RUN — nothing has been deleted")
    say("=" * 64)
    say(f"Messages currently loaded : {len(scanned)}")
    say(f"  …that are yours          : {len(own)}")
    say(f"  …yours, on/before {cutoff} : {len(deletable)}  <-- would be DELETED")
    if unknown_own:
        say(f"  …yours, date unknown     : {len(unknown_own)}  (SKIPPED — see README)")
    say("")

    if deletable:
        say("Preview of the earliest messages that would be deleted:")
        for m in deletable[:15]:
            d = m["dt"].date().isoformat() if m["dt"] else "??"
            preview = m["text"].replace("\n", " ")[:70]
            say(f"   [{d}] {preview}")
        if len(deletable) > 15:
            say(f"   … and {len(deletable) - 15} more")
    else:
        say("Nothing matched. If you KNOW you have messages here, the selectors")
        say("probably need adjusting — see README.md > 'Fixing selectors'.")
    say("=" * 64)
    return len(deletable)


# --------------------------------------------------------------------------- #
#  Main
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(description="Delete your own Fansly messages up to a cutoff date.")
    ap.add_argument("--selectors", default=str(HERE / "selectors.json"),
                    help="Path to selectors.json")
    ap.add_argument("--headless", action="store_true",
                    help="Run without a visible window (not recommended; you must log in).")
    ap.add_argument("--inspect", action="store_true",
                    help="Open the Playwright inspector after loading, to find selectors.")
    args = ap.parse_args()

    sel = load_selectors(args.selectors)
    now = datetime.now()

    with sync_playwright() as pw:
        context = pw.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            headless=args.headless,
            viewport={"width": 1280, "height": 900},
        )
        page = context.pages[0] if context.pages else context.new_page()

        try:
            ensure_login(page, sel)
            open_chat(page, sel)

            if args.inspect:
                say("\n[inspect] Pausing. Use the inspector to hover elements and copy "
                    "selectors, then close it to continue.")
                page.pause()

            # Cutoff date
            say("")
            say("Delete YOUR messages from the earliest one up to and INCLUDING which date?")
            cutoff = None
            while cutoff is None:
                raw = ask("Cutoff date (e.g. 2025-01-31): ")
                try:
                    cutoff = parse_cutoff(raw)
                except Exception:
                    say("  Couldn't understand that date. Try YYYY-MM-DD.")
            say(f"Cutoff set to {cutoff} (messages on/before this date).")

            # Load full history, then dry run
            say("\nLoading chat history (scrolling to the beginning) …")
            scroll_to_top(page, sel)
            scanned = scan_rendered(page, sel, now)
            expected = dry_run_report(scanned, cutoff)

            if expected == 0:
                say("\nNothing to delete. Exiting.")
                return

            # Confirm for real
            say("")
            if not ask_yes(f"Proceed to DELETE these {expected} message(s)? This cannot be undone.",
                           default=False):
                say("No changes made. Exiting.")
                return
            typed = ask('Type DELETE to confirm: ')
            if typed != "DELETE":
                say("Not confirmed. No changes made.")
                return

            # Deletion loop — always act on the earliest qualifying message.
            say("\nDeleting …")
            deleted = 0
            stuck = 0
            cap = expected * 3 + 20
            for _ in range(cap):
                scroll_to_top(page, sel)
                scanned = scan_rendered(page, sel, now)
                idx = topmost_target_index(scanned, cutoff)
                if idx is None:
                    break
                handles = page.query_selector_all(sel["message"])
                if idx >= len(handles):
                    stuck += 1
                    if stuck >= 3:
                        break
                    continue
                ok = click_delete(page, handles[idx], sel)
                if ok:
                    deleted += 1
                    stuck = 0
                    say(f"  deleted {deleted}/{expected}")
                    time.sleep(1.0)   # be gentle; avoid tripping rate limits
                else:
                    stuck += 1
                    if stuck >= 3:
                        say("  Couldn't find the delete control on a message 3 times in a row.")
                        say("  The delete_button/menu_button selectors likely need fixing "
                            "(see README).")
                        break

            say(f"\nDone. Deleted {deleted} message(s).")
            if deleted < expected:
                say(f"({expected - deleted} expected message(s) were not deleted — re-run to "
                    "continue, or check selectors.)")

        finally:
            context.close()


if __name__ == "__main__":
    main()
