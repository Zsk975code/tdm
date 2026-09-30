@echo off
setlocal
set "HERE=%~dp0"
if exist "%HERE%index.html" (set "ROOT=%HERE%") else (set "ROOT=%HERE%build\web-desktop")
if not exist "%ROOT%\index.html" (
  echo ERROR: cannot find build/web-desktop/index.html
  echo Put this script in project root, or inside build/web-desktop.
  pause
  exit /b 1
)
cd /d "%ROOT%"
echo Starting local server in: %ROOT%
where py >nul 2>nul
if %errorlevel%==0 (set "PY=py") else (set "PY=python")
start /B %PY% -m http.server 8080 >server.log 2>&1
timeout /t 2 >nul
start "" "http://localhost:8080/"
echo.
echo Game should now be open in your browser.
echo Close this window to stop the server.
echo If the page cannot be opened, check server.log in this folder.
echo.
pause
