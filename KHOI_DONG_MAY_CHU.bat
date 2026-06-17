@echo off
echo ============================================
echo    Khoi dong may chu web - TCS13
echo ============================================
echo.

:: Tat may chu cu neu dang chay tren cong 8080
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo Da tat may chu cu (neu co).
echo Dang khoi dong may chu moi tai cong 8080...
echo.
echo Tinh nang:
echo  - Phuc vu trang web tinh (HTML/CSS/JS)
echo  - POST /save-data: luu thang vao data_v1_8.js va backup vao thu muc data/
echo.
echo Dia chi truy cap (Cung Mang LAN/Wi-Fi):
echo  - Truc tiep tren may nay : http://localhost:8080/
echo  - Cac may tinh/dien thoai khac CUNG MANG Wi-Fi co the thu truy cap qua IP cua may nay, vi du nhu: http://[IP_CUA_MAY_NAY]:8080/
echo.
echo *** NEU MUON TRUY CAP KHI KHAC MANG (3G/4G, Wi-Fi khac) ***
echo   =^> Hay mo file TRUY_CAP_TU_XA.bat de tao duong link Internet!
echo.
echo Giu cua so nay mo de may chu hoat dong.
echo Dong cua so nay se dung may chu.
echo.

powershell -ExecutionPolicy Bypass -File "D:\Users\Administrator\.gemini\antigravity\brain\ea49473e-4496-41e3-a175-ec37e6fb2049\scratch\serve.ps1"

pause
