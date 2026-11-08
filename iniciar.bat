@echo off
rem Abre o LittleBigCity no navegador usando um servidor local (precisa do Python).
cd /d "%~dp0"
start "" http://127.0.0.1:8642/
python -m http.server 8642 --bind 127.0.0.1
