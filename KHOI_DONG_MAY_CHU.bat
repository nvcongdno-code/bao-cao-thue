@echo off
echo ============================================
echo    Khoi dong may chu web (CHEO CHE GIAU - BAO MAT)
echo ============================================
echo.

:: Tat may chu cu neu dang chay tren cong 8080
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo Da tat may chu cu (neu co).
echo Dang khoi dong may chu moi tai cong 8080...
echo.
echo *** LUY Y BAO MAT ***
echo May chu nay chi chay NOI BO tren may tinh cua ban.
echo KHONG cho phep bat ky thiet bi nao khac truy cap vao!
echo.
echo Dia chi truy cap an toan (Copy va dan vao trinh duyet):
echo  =^> http://localhost:8080/ hoac http://127.0.0.1:8080/
echo.
echo Giu cua so nay mo de may chu hoat dong, hoac ban co the thu nho no xuong.
echo Dong cua so nay se dung may chu.
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
pause
