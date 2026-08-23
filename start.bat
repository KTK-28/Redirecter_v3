@echo off
title Redirector — Broken Link Redirect Fixer
color 0A

echo ===================================================
echo             REDIRECTOR APP LAUNCHER
echo ===================================================
echo.

REM 1. Check Python installation
where python >nul 2>&1
if errorlevel 1 goto NO_PYTHON
goto PYTHON_OK

:NO_PYTHON
echo [ERROR] Python is not installed or not added to PATH.
echo Please download Python from https://www.python.org/downloads/
echo.
pause
exit /b 1

:PYTHON_OK
REM 2. Create virtual environment if missing
if exist .venv goto VENV_OK
echo [1/3] Creating Python virtual environment (.venv)...
python -m venv .venv
if errorlevel 1 goto VENV_FAIL
echo     Virtual environment created.
goto VENV_OK

:VENV_FAIL
echo [ERROR] Failed to create virtual environment.
pause
exit /b 1

:VENV_OK
echo [1/3] Virtual environment (.venv) found.

REM 3. Check for .env file
if exist .env goto ENV_OK
if exist .env.example copy .env.example .env >nul
echo [2/3] Created .env configuration file.
goto ENV_DONE

:ENV_OK
echo [2/3] Configuration file (.env) found.

:ENV_DONE
REM 4. Install requirements
echo [3/3] Verifying dependencies (Flask, requests, openpyxl, python-dotenv)...
if exist .venv\Scripts\python.exe (
    .venv\Scripts\python.exe -m pip install -r requirements.txt >nul 2>&1
) else (
    python -m pip install -r requirements.txt >nul 2>&1
)

echo.
echo ===================================================
echo     Starting Redirector at http://localhost:5000
echo ===================================================
echo.

start http://localhost:5000

if exist .venv\Scripts\python.exe (
    .venv\Scripts\python.exe app.py
) else (
    python app.py
)

echo.
echo [INFO] App server stopped.
pause
