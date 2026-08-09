# Fansly message cleaner — iPhone (Safari bookmarklet)

Deletes **your own** Fansly messages in one chat, oldest-first, up to a cutoff
date — running entirely inside your own logged-in Safari tab. No computer, no
password sharing, no app to install.

## What it does when you tap it
1. Asks for a cutoff date (`YYYY-MM-DD`).
2. Scrolls the chat to the very beginning to load your history.
3. Shows a **preview**: how many messages it found, how many are yours, how many
   would be deleted. Nothing happens unless you tap **OK**.
4. Deletes your messages oldest-first, up to that date, with a progress box at
   the bottom of the screen.

Messages from the other person are never touched. Deletions are **permanent**.

---

## One-time setup on your iPhone

Bookmarklets can't be typed into Safari's address bar — you save one as a
bookmark, then edit the bookmark's address. Steps:

1. **Copy the bookmarklet code.** Open `bookmarklet.txt` (in this folder on
   GitHub), tap **Raw**, then long-press → **Select All** → **Copy**. It's a
   long line starting with `javascript:` — that's correct.
   *(Or just ask the assistant in chat to paste it, and copy it from there.)*

2. **Make a bookmark to edit.** In Safari, go to any page (e.g. fansly.com),
   tap the **Share** icon → **Add Bookmark** → Save. Name it
   `Fansly Cleaner`.

3. **Paste the code into that bookmark.** Tap the **book icon** (📖) → find
   `Fansly Cleaner` → tap **Edit** → tap the bookmark → clear the **address/URL**
   field and **paste** the code you copied. Save.

## Using it
1. In Safari, log into **fansly.com** and **open the chat** you want to clean.
2. Tap the **book icon** (📖) → **Bookmarks** → tap **Fansly Cleaner**.
3. Enter the cutoff date, check the preview, tap **OK** to delete.

If a chat is very long it may take a while — you can close it and tap the
bookmark again later; it always resumes from the earliest remaining message.

---

## If the preview says it found 0 (or the wrong count)

I can't test against Fansly's live page, so the selectors are best guesses and
may need one tweak. **Tell the assistant the numbers the preview showed** (e.g.
"loaded: 0" or "yours: 0") and it'll give you an updated bookmarklet to paste
in. That's the whole fix — you don't need to edit anything yourself.

## If tapping the bookmark does nothing at all
Fansly may block bookmarklets with a security policy (CSP). If so, ask the
assistant for the **iOS Shortcuts** version, which runs the same script a
different way.

## Files
| File | Purpose |
|------|---------|
| `bookmarklet.txt` | The one-line code to paste into a Safari bookmark. |
| `bookmarklet.src.js` | Readable source (what the one-liner is built from). |
