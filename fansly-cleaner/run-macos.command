#!/bin/bash
# Double-click this file on macOS to run the Fansly message cleaner.
# (If macOS blocks it the first time: right-click > Open, or run
#  `chmod +x run-macos.command` once in Terminal.)

cd "$(dirname "$0")" || exit 1

PY=python3
command -v "$PY" >/dev/null 2>&1 || PY=python
if ! command -v "$PY" >/dev/null 2>&1; then
  echo "Python 3 is not installed. Get it from https://www.python.org/downloads/ and try again."
  read -r -p "Press Enter to close." _
  exit 1
fi

if [ ! -d .venv ]; then
  echo "First run: setting things up (this can take a couple of minutes)…"
  "$PY" -m venv .venv || { echo "Could not create the environment."; read -r -p "Press Enter to close." _; exit 1; }
fi

# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt
python -m playwright install chromium

python fansly_cleaner.py

echo
read -r -p "Finished. Press Enter to close." _
