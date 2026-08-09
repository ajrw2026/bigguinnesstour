@echo off
REM Double-click this file on Windows to run the Fansly message cleaner.
cd /d "%~dp0"

where py >nul 2>nul && (set "PY=py") || (set "PY=python")
%PY% --version >nul 2>nul || (
  echo Python is not installed. Get it from https://www.python.org/downloads/
  echo IMPORTANT: tick "Add Python to PATH" during install, then try again.
  pause
  exit /b 1
)

if not exist .venv (
  echo First run: setting things up ^(this can take a couple of minutes^)...
  %PY% -m venv .venv || (echo Could not create the environment. & pause & exit /b 1)
)

call .venv\Scripts\activate.bat
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt
python -m playwright install chromium

python fansly_cleaner.py

echo.
pause
