# Fansly message cleaner

Interactively deletes **your own** sent messages in a single Fansly chat, from
the earliest message up to (and including) a cutoff date you choose.

It drives a real Chromium browser with [Playwright]:

1. You log in **once, manually**, in the window it opens (handles captcha / 2FA).
   The login is saved locally so you don't repeat it.
2. You pick the chat — type the person's name, or just open the chat yourself.
3. You set a cutoff date.
4. It runs a **dry run** and shows exactly what it would delete.
5. Only after you type `DELETE` does it click the trash-can on each of your
   messages, oldest first, stopping at your cutoff date.

Messages from the other person are never touched. Messages whose date can't be
read are **skipped and reported**, never deleted.

---

## Easiest way (no terminal)

Download this folder to your own computer, then **double-click**:

- **macOS:** `run-macos.command` (first time, if blocked: right-click → Open)
- **Windows:** `run-windows.bat`

It sets everything up on first run and launches the bot. You just need
[Python](https://www.python.org/downloads/) installed first (on Windows, tick
"Add Python to PATH" during install).

> This must run on **your own computer** — it can't run inside a Claude chat
> session, which is sandboxed with no browser window, no saved login, and no
> network access to Fansly.

## Setup (manual)

You need Python 3.9+.

```bash
cd fansly-cleaner
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m playwright install chromium
```

## Run

```bash
python fansly_cleaner.py
```

Follow the prompts. On the first run, log in when the browser opens; the session
is remembered in `browser-profile/` (git-ignored) for next time.

---

## Important: first run may need a selector check

Fansly's website markup isn't public and changes over time, so this bot uses a
list of **best-guess selectors** in `selectors.json`. The built-in **dry run**
is there precisely so you can confirm detection is correct **before** anything
is deleted.

When you reach the dry-run summary, check:

- Does the count of "messages currently loaded" look plausible?
- Does "…that are yours" match roughly how many *you* actually sent?
- Do the previewed dates look right?

If those numbers are `0` or clearly wrong, the selectors need a quick fix — the
bot is working, it just can't see the right elements yet.

### Fixing selectors

1. Run with the inspector:
   ```bash
   python fansly_cleaner.py --inspect
   ```
   After the chat opens it pauses and opens the Playwright inspector.
2. In the Chromium window, right-click one of **your own** message bubbles →
   **Inspect**. Look at the element's classes.
3. Edit `selectors.json` and update the relevant entry. The keys most likely to
   need tweaking:
   - `message` — matches one whole message bubble.
   - `own_message` — matches **only** messages you sent (this is what decides
     "yours" vs theirs).
   - `timestamp` / `date_separator` — where dates come from.
   - `delete_button` / `menu_button` / `confirm_button` — the trash-can and any
     confirmation.
4. Each entry can list several comma-separated candidates; the first that
   matches wins. Re-run and re-check the dry run.

---

## Safety notes

- **Nothing is deleted without confirmation** — you review a dry run, answer a
  prompt, and type `DELETE`.
- Deletions are **permanent**. There is no undo on Fansly.
- The bot pauses ~1s between deletions to be gentle and avoid rate-limits. For a
  very large chat it will take a while; you can stop with `Ctrl+C` and re-run
  later — it always continues from the earliest remaining message.
- Only **your own account** is affected, and only messages **you** sent.

## Files

| File | Purpose |
|------|---------|
| `fansly_cleaner.py` | The bot. |
| `selectors.json` | Editable CSS selectors for the Fansly UI. |
| `requirements.txt` | Python dependencies. |
| `browser-profile/` | Saved login (created on first run, git-ignored). |

## A note on terms of service

This automates **your own** account to delete **your own** messages. Automating
a website can still be against its Terms of Service, and heavy automated
activity could get an account flagged. Use it sparingly and at your own risk.

[Playwright]: https://playwright.dev/python/
