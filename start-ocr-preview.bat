@echo off
cd /d "%~dp0"
echo Starting Universal OCR Preview at http://127.0.0.1:8000
echo Keep this window open while using the app.
echo Press Ctrl+C here to stop the local server.
py -m http.server 8000 --bind 127.0.0.1
pause
