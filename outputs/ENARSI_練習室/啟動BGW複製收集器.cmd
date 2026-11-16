@echo off
chcp 65001 >nul
cd /d "%~dp0"
"C:\Users\XQ138\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" collector.py
pause
