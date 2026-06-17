@echo off
chcp 65001 >nul
echo =========================================================
echo        DANG TAO DUONG DAN TRUY CAP TU XA (INTERNET)
echo =========================================================
echo.
echo 1. Hay chac chan ban da chay file KHOI_DONG_MAY_CHU.bat truoc.
echo 2. Vui long cho trong giay lat, duong link HTTPS se hien ra ben duoi.
echo    (Tim dong co dang: https://abcd.trycloudflare.com)
echo 3. Copy duong link do va gui qua Zalo de truy cap tren dien thoai.
echo 4. Neu co canh bao tuong lua, vui long chon "Allow access".
echo.
echo Vui long giu nguyen cua so nay trong suot qua trinh truy cap.
echo De ket thuc, bam dau X tat cua so.
echo =========================================================
echo.
cloudflared.exe tunnel --url http://localhost:8080
pause
