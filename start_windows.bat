@echo off
setlocal

cd /d "%~dp0"

echo.
echo Falling Ball AI Platform - Windows launcher
echo Project directory: %cd%
echo.

where py >nul 2>nul
if %errorlevel%==0 (
  set PY_CMD=py -3
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    set PY_CMD=python
  ) else (
    echo Python was not found. Please install Python 3.11 or newer first.
    echo Download: https://www.python.org/downloads/windows/
    pause
    exit /b 1
  )
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating Windows virtual environment...
  %PY_CMD% -m venv .venv
  if errorlevel 1 (
    echo Failed to create virtual environment.
    pause
    exit /b 1
  )
)

call ".venv\Scripts\activate.bat"

echo Installing required packages...
python -m pip install --upgrade pip
python -m pip install -r requirements-vision.txt
if exist requirements-tracking-extra.txt (
  python -m pip install -r requirements-tracking-extra.txt
)

echo.
echo Starting server at http://127.0.0.1:8877
echo Keep this window open while using the platform.
echo Press Ctrl+C to stop the server.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8877'"
python run.py 8877

pause
