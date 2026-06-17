// -------------------------------------------------------------------------
// Logic điều khiển giao diện thu ngân sách - Thuế cơ sở 13
// Sử dụng Chart.js để vẽ biểu đồ và quản lý tương tác dữ liệu
// -------------------------------------------------------------------------

function initApp() {
  // Trạng thái ứng dụng
  // Phát hiện nếu đây là trang quản trị (admin.html) hoặc trang xem chung (index.html)
  const isAdminPage = document.getElementById("btn-save-baseline") !== null;
  const isMobileDevice = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Nếu là trang quản trị và ngày báo cáo trong file data_v1_8.js khác với ngày trong localStorage,
  // nghĩa là có cập nhật dữ liệu mới chính thức từ Git, ta tự động xóa cache lưu trữ cũ để nạp mới.
  if (isAdminPage && window.BUDGET_DATA && window.BUDGET_DATA.metadata) {
    const savedStateRaw = localStorage.getItem("thue_co_so_13_current_state");
    let stateDate = null;
    if (savedStateRaw) {
      try {
        const parsedS = JSON.parse(savedStateRaw);
        stateDate = parsedS.metadata ? parsedS.metadata.reportDate : null;
      } catch(e) {}
    }
    
    if (stateDate && window.BUDGET_DATA.metadata.reportDate !== stateDate) {
      localStorage.removeItem("thue_co_so_13_baseline");
      localStorage.removeItem("thue_co_so_13_current_state");
      // Tuyệt đối không xóa thue_co_so_13_history để giữ lại số liệu đầu tháng!
    }
  }

  // Khôi phục lịch sử từ file tĩnh nếu có (để đồng bộ đa thiết bị)
  if (window.BUDGET_HISTORY && Array.isArray(window.BUDGET_HISTORY)) {
    const localHistory = JSON.parse(localStorage.getItem("thue_co_so_13_history") || "[]");
    if (localHistory.length === 0 || window.BUDGET_HISTORY.length > localHistory.length) {
      localStorage.setItem("thue_co_so_13_history", JSON.stringify(window.BUDGET_HISTORY));
    }
  }

  // Nạp dữ liệu gốc (Baseline)
  let originalBaseline = window.BUDGET_DATA;
  if (isAdminPage) {
    const savedBaseline = localStorage.getItem("thue_co_so_13_baseline");
    if (savedBaseline) {
      try {
        originalBaseline = JSON.parse(savedBaseline);
      } catch (e) {
        console.warn("Lỗi đọc dữ liệu gốc baseline lưu trữ:", e.message);
      }
    }
  }

  // Trạng thái hoạt động hiện tại (Current state)
  // Trên trang xem chung (index.html), ta luôn nạp dữ liệu gốc mới nhất từ Server để tránh lãnh đạo xem số cũ bị cache
  let currentData;
  const savedState = isAdminPage ? localStorage.getItem("thue_co_so_13_current_state") : null;
  if (savedState) {
    try {
      currentData = JSON.parse(savedState);
      
      // Tự động kiểm tra nếu dữ liệu lưu trữ bị lỗi để tự khôi phục
      let isValid = false;
      if (currentData && currentData.communes && currentData.communes.length === 7) {
        isValid = true;
      }
      
      if (!isValid) {
        throw new Error("Dữ liệu lưu trữ trong trình duyệt không đúng cấu trúc");
      }

      // Sửa lỗi chính tả từ localStorage nếu có
      if (currentData && currentData.communes) {
        currentData.communes.forEach(c => {
          if (c.id === "dak_wil" && c.name && c.name.includes("Đấk")) {
            c.name = "Xã Đắk Wil";
          }
        });
      }
    } catch (e) {
      console.warn("Lỗi dữ liệu lưu trữ, khôi phục mặc định:", e.message);
      currentData = JSON.parse(JSON.stringify(originalBaseline));
      localStorage.setItem("thue_co_so_13_current_state", JSON.stringify(currentData));
    }
  } else {
    currentData = JSON.parse(JSON.stringify(originalBaseline));
  }

  // Khởi tạo các key còn thiếu nếu dữ liệu cũ (data_v1_8.js) chỉ có 8 keys thay vì 12 keys mới nhất
  const allKeys = [
    "enterpriseStateCentral", "enterpriseStateLocal", "enterpriseForeign",
    "enterpriseNonState", "pit", "registration", "landNonAgri", "landRent",
    "land", "minerals", "otherBudget", "others"
  ];
  function normalizeDataKeys(dataObj) {
    if (!dataObj || !dataObj.communes) return;
    dataObj.communes.forEach(c => {
      allKeys.forEach(key => {
        if (!c.provinceTax.details[key]) c.provinceTax.details[key] = { target: 0, ytd: 0, lastYearYtd: 0, periodStartYtd: 0 };
        else if (c.provinceTax.details[key].periodStartYtd === undefined) c.provinceTax.details[key].periodStartYtd = 0;
        
        if (!c.baseTax.details[key]) c.baseTax.details[key] = { target: 0, ytd: 0, lastYearYtd: 0, periodStartYtd: 0 };
        else if (c.baseTax.details[key].periodStartYtd === undefined) c.baseTax.details[key].periodStartYtd = 0;
      });
    });
  }
  normalizeDataKeys(originalBaseline);
  normalizeDataKeys(currentData);
  
  // Áp dụng tính toán Số phát sinh trong kỳ (today) = YTD hiện tại - Số đầu kỳ cho dữ liệu đã lưu
  if (currentData && currentData.communes) {
    currentData.communes.forEach(c => {
      c.provinceTax.today = Object.values(c.provinceTax.details).reduce((sum, item) => sum + ((item?.ytd || 0) - (item?.periodStartYtd || 0)), 0);
      c.baseTax.today = Object.values(c.baseTax.details).reduce((sum, item) => sum + ((item?.ytd || 0) - (item?.periodStartYtd || 0)), 0);
    });
  }
  
  let selectedCommuneId = "tong_hop"; // "tong_hop" đại diện cho Tổng hợp toàn địa bàn
  let sortField = "ytdRate";
  let sortAscending = false;
  let currentViewMode = "combined"; // "combined", "province", "base"
  
  // Bảng số liệu chi tiết theo sắc thuế tại các xã
  // Thay thế hoàn toàn cho biểu đồ thống kê để ban lãnh đạo dễ quan sát

  // Lấy các phần tử DOM
  const communesListEl = document.getElementById("communes-list");
  const activeCommuneTitleEl = document.getElementById("active-commune-name");
  
  // KPI Elements
  const kpiTargetValEl = document.getElementById("kpi-target-value");
  const kpiActualValEl = document.getElementById("kpi-actual-value");
  const kpiRateValEl = document.getElementById("kpi-rate-value");
  const kpiRateProgressEl = document.getElementById("kpi-rate-progress");
  const kpiTodayValEl = document.getElementById("kpi-today-value");
  const kpiTodayTrendEl = document.getElementById("kpi-today-trend");
  const kpiLastYearValEl = document.getElementById("kpi-last-year-value");
  const kpiGrowthEl = document.getElementById("kpi-growth");
  const kpiComparisonValEl = document.getElementById("kpi-comparison-value");
  
  // Table Elements
  const tableBodyEl = document.getElementById("table-body");
  const searchInputEl = document.getElementById("search-input");
  const quickFiltersEl = document.getElementById("quick-commune-filters");
  const btnClearTableFilter = document.getElementById("btn-clear-table-filter");
  const tableTitleEl = document.getElementById("table-title");
  
  // Controls
  const themeToggleBtn = document.getElementById("theme-toggle");
  const printBtn = document.getElementById("btn-print");
  const resetBtn = document.getElementById("btn-reset");
  const overlay = document.getElementById("overlay");
  const reportDatePickerEl = document.getElementById("report-date-picker");
  const lastUpdateTimeEl = document.getElementById("last-update-time");

  // Thiết lập ngày hiện tại của báo cáo và nhãn thời gian
  reportDatePickerEl.value = currentData.metadata.reportDate;
  const printReportDateEl = document.getElementById("print-report-date");
  if (printReportDateEl) printReportDateEl.textContent = formatDate(currentData.metadata.reportDate);
  
  function updateLastUpdateTime() {
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    lastUpdateTimeEl.textContent = `Đã cập nhật: ${hrs}:${mins}:${secs} ngày ${day}/${month}/${year}`;
  }
  
  // Gọi khởi tạo thời gian cập nhật lúc tải trang
  updateLastUpdateTime();

  // Đăng ký sự kiện thay đổi ngày báo cáo (Tự động tải lại số liệu của ngày được chọn)
  reportDatePickerEl.addEventListener("change", (e) => {
    const newDate = e.target.value;
    
    // Tìm kiếm trong lịch sử xem có số liệu của ngày này không
    const history = JSON.parse(localStorage.getItem("thue_co_so_13_history") || "[]");
    const matchedRecord = history.find(item => item.data && item.data.metadata && item.data.metadata.reportDate === newDate);
    
    if (matchedRecord) {
      currentData = JSON.parse(JSON.stringify(matchedRecord.data));
      showToast("Đã cập nhật số liệu");
      finalizeDateChange(newDate);
    } else if (originalBaseline && originalBaseline.metadata && originalBaseline.metadata.reportDate === newDate) {
      currentData = JSON.parse(JSON.stringify(originalBaseline));
      showToast("Đã cập nhật số liệu");
      finalizeDateChange(newDate);
    } else {
      // Hiển thị modal tùy chỉnh thay vì confirm()
      showDateChangeModal(newDate, e.target);
    }
  });

  function finalizeDateChange(newDate) {
    const prdEl = document.getElementById("print-report-date");
    if (prdEl) prdEl.textContent = formatDate(newDate);
    updateLastUpdateTime();
    onCommuneSelected(); // Cập nhật lại giao diện
    renderSidebar(); // Vẽ lại sidebar
  }

  function showDateChangeModal(newDate, inputEl) {
    const oldDate = currentData.metadata.reportDate;
    
    // Tạo modal overlay
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0"; overlay.style.left = "0"; overlay.style.width = "100%"; overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0,0,0,0.6)";
    overlay.style.zIndex = "9999";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    
    // Tạo modal box
    const box = document.createElement("div");
    box.style.background = "var(--bg-primary)";
    box.style.padding = "20px";
    box.style.borderRadius = "8px";
    box.style.maxWidth = "400px";
    box.style.textAlign = "center";
    box.style.boxShadow = "var(--shadow-xl)";
    box.style.color = "var(--text-primary)";
    
    box.innerHTML = `
      <h3 style="margin-top: 0; color: #f59e0b;">Ngày chưa có dữ liệu</h3>
      <p style="font-size: 0.9rem; margin-bottom: 20px;">Hệ thống không tìm thấy dữ liệu cho ngày <b>${newDate}</b>. Bạn muốn xử lý thế nào?</p>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button id="btn-modal-inherit" style="padding: 10px; border-radius: 4px; border: none; background: var(--color-primary); color: white; cursor: pointer; font-weight: bold;">
          1. Kế thừa dữ liệu hiện tại (Khuyên dùng khi sang ngày mới)
        </button>
        <button id="btn-modal-blank" style="padding: 10px; border-radius: 4px; border: 1px solid #ef4444; background: transparent; color: #ef4444; cursor: pointer; font-weight: bold;">
          2. Tạo mới hoàn toàn (Xóa trắng 0đ)
        </button>
        <button id="btn-modal-cancel" style="padding: 10px; border-radius: 4px; border: none; background: var(--bg-secondary); color: var(--text-muted); cursor: pointer; font-weight: bold;">
          Hủy bỏ (Giữ nguyên ngày cũ)
        </button>
      </div>
    `;
    
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    
    // Xử lý sự kiện
    document.getElementById("btn-modal-inherit").onclick = () => {
      currentData.metadata.previousReportDate = currentData.metadata.reportDate;
      currentData.metadata.reportDate = newDate;
      saveSnapshot(`Kế thừa dữ liệu sang ${newDate}`, "Manual");
      showToast(`Đã chuyển sang ngày mới: ${newDate}`);
      document.body.removeChild(overlay);
      finalizeDateChange(newDate);
    };
    
    document.getElementById("btn-modal-blank").onclick = () => {
      // Đặt tất cả về 0
      currentData.metadata.previousReportDate = currentData.metadata.reportDate;
      currentData.metadata.reportDate = newDate;
      currentData.communes.forEach(c => {
        Object.keys(c.provinceTax.details).forEach(k => {
          c.provinceTax.details[k] = { target: 0, ytd: 0, lastYearYtd: 0, periodStartYtd: c.provinceTax.details[k].periodStartYtd || 0 };
        });
        Object.keys(c.baseTax.details).forEach(k => {
          c.baseTax.details[k] = { target: 0, ytd: 0, lastYearYtd: 0, periodStartYtd: c.baseTax.details[k].periodStartYtd || 0 };
        });
        updateCommuneDerivedFields(c, 10, null);
      });
      saveSnapshot(`Tạo dữ liệu trắng cho ${newDate}`, "Manual");
      showToast(`Đã tạo dữ liệu trống 0đ cho ngày ${newDate}`);
      document.body.removeChild(overlay);
      finalizeDateChange(newDate);
    };
    
    document.getElementById("btn-modal-cancel").onclick = () => {
      inputEl.value = oldDate;
      document.body.removeChild(overlay);
    };
  }

  // -------------------------------------------------------------------------
  // 1. Quản lý Theme (Sáng/Tối)
  // -------------------------------------------------------------------------
  const savedTheme = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeButtonIcon(savedTheme);

  themeToggleBtn.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    updateThemeButtonIcon(newTheme);
    // Vẽ lại bảng chi tiết sắc thuế để ăn theo theme mới
    renderTaxBreakdownTable();
  });

  function updateThemeButtonIcon(theme) {
    themeToggleBtn.innerHTML = theme === "dark" 
      ? '<span class="icon">☀️</span> Chế độ Sáng' 
      : '<span class="icon">🌙</span> Chế độ Tối';
  }

  // Đăng ký sự kiện thay đổi luồng nguồn thu (Tổng hợp / Thuế Tỉnh / Thuế Cơ Sở)
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentViewMode = btn.getAttribute("data-mode");
      
      // Vẽ lại giao diện, sidebar và bảng theo chế độ xem mới
      onCommuneSelected();
      renderSidebar();
      
      showToast(`Đã chuyển sang chế độ xem: ${btn.textContent.trim()}`);
    });
  });

  // Đăng ký sự kiện nút chọn xã nhanh (Quick commune pills)
  document.querySelectorAll(".filter-commune-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedCommuneId = btn.getAttribute("data-commune-id");
      onCommuneSelected();
    });
  });

  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // 2. Chuyển đổi và Tính toán số liệu theo nguồn thu (Thuế tỉnh / Thuế cơ sở / Tổng cộng)
  // -------------------------------------------------------------------------
  function getCommuneMetrics(commune, mode = currentViewMode) {
    if (!commune) return null;
    
    if (mode === "province") {
      return {
        target: commune.provinceTax.target,
        ytd: commune.provinceTax.ytd,
        today: commune.provinceTax.today,
        lastYearYtd: commune.provinceTax.lastYearYtd,
        details: commune.provinceTax.details
      };
    } else if (mode === "base") {
      return {
        target: commune.baseTax.target,
        ytd: commune.baseTax.ytd,
        today: commune.baseTax.today,
        lastYearYtd: commune.baseTax.lastYearYtd,
        details: commune.baseTax.details
      };
    } else {
      // combined (Tổng cộng cả hai)
      const combinedDetails = {};
      Object.keys(commune.provinceTax.details).forEach(key => {
        combinedDetails[key] = {
          target: commune.provinceTax.details[key].target + commune.baseTax.details[key].target,
          ytd: commune.provinceTax.details[key].ytd + commune.baseTax.details[key].ytd,
          lastYearYtd: commune.provinceTax.details[key].lastYearYtd + commune.baseTax.details[key].lastYearYtd
        };
      });
      return {
        target: commune.provinceTax.target + commune.baseTax.target,
        ytd: commune.provinceTax.ytd + commune.baseTax.ytd,
        today: commune.provinceTax.today + commune.baseTax.today,
        lastYearYtd: commune.provinceTax.lastYearYtd + commune.baseTax.lastYearYtd,
        details: combinedDetails
      };
    }
  }

  function getAggregatedData() {
    const agg = {
      id: "tong_hop",
      name: "Tổng hợp 7 Xã",
      provinceTax: {
        target: 0, today: 0, ytd: 0, lastYearYtd: 0,
        details: {}
      },
      baseTax: {
        target: 0, today: 0, ytd: 0, lastYearYtd: 0,
        details: {}
      }
    };

    // Khởi tạo các chi tiết động từ xã đầu tiên
    if (currentData.communes.length > 0) {
      const firstCommune = currentData.communes[0];
      Object.keys(firstCommune.provinceTax.details).forEach(key => {
        agg.provinceTax.details[key] = { target: 0, ytd: 0, lastYearYtd: 0 };
      });
      Object.keys(firstCommune.baseTax.details).forEach(key => {
        agg.baseTax.details[key] = { target: 0, ytd: 0, lastYearYtd: 0 };
      });
    }

    currentData.communes.forEach(c => {
      // Cộng dồn Thuế tỉnh
      agg.provinceTax.target += c.provinceTax.target || 0;
      agg.provinceTax.today += c.provinceTax.today || 0;
      agg.provinceTax.ytd += c.provinceTax.ytd || 0;
      agg.provinceTax.lastYearYtd += c.provinceTax.lastYearYtd || 0;
      Object.keys(agg.provinceTax.details).forEach(key => {
        if (c.provinceTax.details[key]) {
          agg.provinceTax.details[key].target += c.provinceTax.details[key].target || 0;
          agg.provinceTax.details[key].ytd += c.provinceTax.details[key].ytd || 0;
          agg.provinceTax.details[key].lastYearYtd += c.provinceTax.details[key].lastYearYtd || 0;
        }
      });

      // Cộng dồn Thuế cơ sở
      agg.baseTax.target += c.baseTax.target || 0;
      agg.baseTax.today += c.baseTax.today || 0;
      agg.baseTax.ytd += c.baseTax.ytd || 0;
      agg.baseTax.lastYearYtd += c.baseTax.lastYearYtd || 0;
      Object.keys(agg.baseTax.details).forEach(key => {
        if (c.baseTax.details[key]) {
          agg.baseTax.details[key].target += c.baseTax.details[key].target || 0;
          agg.baseTax.details[key].ytd += c.baseTax.details[key].ytd || 0;
          agg.baseTax.details[key].lastYearYtd += c.baseTax.details[key].lastYearYtd || 0;
        }
      });
    });

    return agg;
  }


  // Lấy dữ liệu của đối tượng đang hoạt động và làm phẳng theo currentViewMode
  function getActiveEntity() {
    let rawActive;
    if (selectedCommuneId === "tong_hop") {
      rawActive = getAggregatedData();
    } else {
      rawActive = currentData.communes.find(c => c.id === selectedCommuneId);
    }
    const metrics = getCommuneMetrics(rawActive, currentViewMode);
    return {
      id: rawActive.id,
      name: rawActive.name,
      ...metrics
    };
  }

  // -------------------------------------------------------------------------
  // 3. Hiển thị UI và Cập nhật KPIs
  // -------------------------------------------------------------------------
  function updateKPIs() {
    const active = getActiveEntity();
    
    // 1. Chỉ tiêu dự toán
    kpiTargetValEl.textContent = formatMoney(active.target);
    
    // 2. Thực thu đến ngày
    kpiActualValEl.textContent = formatMoney(active.ytd);
    
    // 3. Tỷ lệ đạt (%)
    const rate = active.target > 0 ? (active.ytd / active.target) * 100 : 0;
    kpiRateValEl.textContent = formatPercent(rate);
    kpiRateProgressEl.style.width = Math.min(rate, 100) + "%";
    
    // Đổi màu thanh tiến độ dựa trên kết quả đạt được
    const parentCard = kpiRateValEl.closest(".kpi-card");
    parentCard.className = "kpi-card";
    if (rate >= 85) {
      kpiRateProgressEl.style.backgroundColor = "var(--color-success)";
      parentCard.classList.add("success");
    } else if (rate >= 50) {
      kpiRateProgressEl.style.backgroundColor = "var(--color-warning)";
      parentCard.classList.add("warning");
    } else {
      kpiRateProgressEl.style.backgroundColor = "var(--color-danger)";
      parentCard.classList.add("danger");
    }

    // Helper inside updateKPIs for date rendering
    function formatShortDate(dateStr) {
      if (!dateStr) return "";
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    }

    function getDaysDiff(d1, d2) {
      if (!d1 || !d2) return 0;
      const t1 = new Date(d1).getTime();
      const t2 = new Date(d2).getTime();
      if (isNaN(t1) || isNaN(t2)) return 0;
      return Math.max(0, Math.round((t2 - t1) / (1000 * 60 * 60 * 24)));
    }

    // 4. Số thu trong kỳ cập nhật
    kpiTodayValEl.textContent = formatMoney(active.today);
    
    const targetPercent = active.target > 0 ? (active.today / active.target) * 100 : 0;
    
    if (active.today > 0) {
      kpiTodayTrendEl.className = "percentage-badge up";
      kpiTodayTrendEl.textContent = `Đóng góp +${formatPercent(targetPercent, 2)} chỉ tiêu`;
    } else {
      kpiTodayTrendEl.className = "percentage-badge down";
      kpiTodayTrendEl.textContent = "Không phát sinh tăng";
    }

    const periodEl = document.getElementById("kpi-today-period");
    if (periodEl) {
      const currDate = currentData.metadata.reportDate;
      const parts = currDate.split("-");
      if (parts.length === 3) {
        periodEl.textContent = `Tính từ 01/${parts[1]}/${parts[0]} đến ${parts[2]}/${parts[1]}/${parts[0]}`;
      } else {
        periodEl.textContent = `Lũy kế đến ngày ${formatShortDate(currDate)}`;
      }
    }

    // 5. Cùng kỳ năm trước
    kpiLastYearValEl.textContent = formatMoney(active.lastYearYtd);
    
    // 6. So sánh cùng kỳ
    const growth = active.lastYearYtd > 0 ? ((active.ytd - active.lastYearYtd) / active.lastYearYtd) * 100 : 0;
    if (kpiComparisonValEl) {
      kpiComparisonValEl.textContent = (growth >= 0 ? "+" : "") + formatPercent(growth);
      
      const comparisonCard = kpiComparisonValEl.closest(".kpi-card");
      if (comparisonCard) {
        comparisonCard.className = "kpi-card";
        if (growth >= 0) {
          kpiComparisonValEl.style.color = "var(--color-success)";
          comparisonCard.classList.add("success");
        } else {
          kpiComparisonValEl.style.color = "var(--color-danger)";
          comparisonCard.classList.add("danger");
        }
      }
    }
    
    if (growth >= 0) {
      kpiGrowthEl.className = "percentage-badge up";
      kpiGrowthEl.innerHTML = `▲ +${formatPercent(growth)} so với cùng kỳ`;
    } else {
      kpiGrowthEl.className = "percentage-badge down";
      kpiGrowthEl.innerHTML = `▼ ${formatPercent(growth)} so với cùng kỳ`;
    }
  }

  // -------------------------------------------------------------------------
  // 4. Render danh sách Xã ở Sidebar
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // 4. Render danh sách Xã ở Sidebar & Quick Filters
  // -------------------------------------------------------------------------
  function renderSidebar() {
    communesListEl.innerHTML = "";
    
    // Tạo phần tử "Tổng hợp 7 Xã" làm mục đầu tiên
    const agg = getAggregatedData();
    const aggMetrics = getCommuneMetrics(agg, currentViewMode);
    const aggRate = aggMetrics.target > 0 ? (aggMetrics.ytd / aggMetrics.target) * 100 : 0;
    
    const totalBtn = document.createElement("button");
    totalBtn.className = `commune-item ${selectedCommuneId === "tong_hop" ? "active" : ""}`;
    totalBtn.innerHTML = `
      <span>Tổng hợp 7 Xã</span>
      <span class="badge ${getRateBadgeClass(aggRate)}">${formatPercent(aggRate)}</span>
    `;
    totalBtn.addEventListener("click", () => {
      selectedCommuneId = "tong_hop";
      onCommuneSelected();
    });
    
    communesListEl.appendChild(totalBtn);

    // Tạo các nút cho từng xã
    currentData.communes.forEach((c, index) => {
      const metrics = getCommuneMetrics(c, currentViewMode);
      const rate = metrics.target > 0 ? (metrics.ytd / metrics.target) * 100 : 0;
      const btn = document.createElement("button");
      btn.className = `commune-item ${selectedCommuneId === c.id ? "active" : ""}`;
      btn.innerHTML = `
        <span>${index + 1}. ${c.name}</span>
        <span class="badge ${getRateBadgeClass(rate)}">${formatPercent(rate)}</span>
      `;
      btn.addEventListener("click", () => {
        selectedCommuneId = c.id;
        onCommuneSelected();
      });
      communesListEl.appendChild(btn);
    });
  }

  function renderQuickFilters() {
    if (!quickFiltersEl) return;
    quickFiltersEl.innerHTML = "";
    
    // Nút "Tất cả"
    const totalBtn = document.createElement("button");
    totalBtn.className = `filter-commune-btn ${selectedCommuneId === "tong_hop" ? "active" : ""}`;
    totalBtn.setAttribute("data-commune-id", "tong_hop");
    totalBtn.innerHTML = `🌟 Tất cả (7 Xã)`;
    totalBtn.addEventListener("click", () => {
      selectedCommuneId = "tong_hop";
      onCommuneSelected();
    });
    quickFiltersEl.appendChild(totalBtn);
    
    // Nút cho từng xã
    currentData.communes.forEach(c => {
      const btn = document.createElement("button");
      btn.className = `filter-commune-btn ${selectedCommuneId === c.id ? "active" : ""}`;
      btn.setAttribute("data-commune-id", c.id);
      btn.innerHTML = `📍 ${c.name.replace("Xã ", "")}`;
      btn.addEventListener("click", () => {
        selectedCommuneId = c.id;
        onCommuneSelected();
      });
      quickFiltersEl.appendChild(btn);
    });
  }

  function getRateBadgeClass(rate) {
    if (rate >= 85) return "badge-success";
    if (rate >= 50) return "badge-warning";
    return "badge-danger";
  }

  function onCommuneSelected() {
    const active = getActiveEntity();
    
    // Đổi định dạng hiển thị chỉ còn Tên xã
    const rawDate = reportDatePickerEl.value; // YYYY-MM-DD
    const formattedDate = rawDate.split('-').reverse().join('/'); // DD/MM/YYYY (vẫn giữ lại biến này phòng khi cần dùng ở đâu đó)
    const fullTitle = active.name;
    
    activeCommuneTitleEl.textContent = fullTitle;

    // Cập nhật giao diện Sidebar active class
    const buttons = communesListEl.querySelectorAll(".commune-item");
    buttons.forEach((btn, index) => {
      if (index === 0) {
        btn.className = `commune-item ${selectedCommuneId === "tong_hop" ? "active" : ""}`;
      } else {
        const c = currentData.communes[index - 1];
        btn.className = `commune-item ${selectedCommuneId === c.id ? "active" : ""}`;
      }
    });

    // Cập nhật giao diện Quick Commune Filters active class
    renderQuickFilters();

    updateKPIs();
    renderTaxBreakdownTable();
    renderTable();
    generatePrintReport();
    
    // Tự động lưu trạng thái dữ liệu hiện tại để tránh mất mát
    localStorage.setItem("thue_co_so_13_current_state", JSON.stringify(currentData));
  }

  // -------------------------------------------------------------------------
  // 5. Vẽ biểu đồ Chart.js
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // 5. Vẽ Bảng số liệu chi tiết theo sắc thuế tại các địa bàn xã
  // -------------------------------------------------------------------------
  function renderTaxBreakdownTable() {
    const query = searchInputEl ? searchInputEl.value.toLowerCase().trim() : "";
    const breakdownBodyEl = document.getElementById("tax-breakdown-body");
    if (!breakdownBodyEl) return;
    
    breakdownBodyEl.innerHTML = "";
    
    let list = currentData.communes;
    
    // Lọc theo xã được chọn (nếu không phải "tong_hop")
    if (selectedCommuneId !== "tong_hop") {
      list = list.filter(c => c.id === selectedCommuneId);
    }
    
    // Lọc theo tìm kiếm (Không phân biệt dấu)
    if (query) {
      list = list.filter(c => cleanName(c.name).includes(cleanName(query)));
    }
    
    // Hàm nội bộ lấy giá trị sắc thuế theo currentViewMode
    function getTaxCatValues(commune, catKey) {
      if (currentViewMode === "province") {
        return {
          target: commune.provinceTax.details[catKey].target,
          ytd: commune.provinceTax.details[catKey].ytd
        };
      } else if (currentViewMode === "base") {
        return {
          target: commune.baseTax.details[catKey].target,
          ytd: commune.baseTax.details[catKey].ytd
        };
      } else { // combined
        return {
          target: commune.provinceTax.details[catKey].target + commune.baseTax.details[catKey].target,
          ytd: commune.provinceTax.details[catKey].ytd + commune.baseTax.details[catKey].ytd
        };
      }
    }
    
    // Render các hàng
    // Render các hàng
    list.forEach(c => {
      const tr = document.createElement("tr");
      tr.className = selectedCommuneId === c.id ? "active-row" : "";
      if (selectedCommuneId === c.id) {
        tr.style.backgroundColor = "var(--color-primary-light)";
      }
      
      const land = getTaxCatValues(c, "land");
      const enterpriseStateCentral = getTaxCatValues(c, "enterpriseStateCentral");
      const enterpriseStateLocal = getTaxCatValues(c, "enterpriseStateLocal");
      const enterpriseForeign = getTaxCatValues(c, "enterpriseForeign");
      const enterpriseNonState = getTaxCatValues(c, "enterpriseNonState");
      const pit = getTaxCatValues(c, "pit");
      const registration = getTaxCatValues(c, "registration");
      const landNonAgri = getTaxCatValues(c, "landNonAgri");
      const landRent = getTaxCatValues(c, "landRent");
      const minerals = getTaxCatValues(c, "minerals");
      const otherBudget = getTaxCatValues(c, "otherBudget");
      const others = getTaxCatValues(c, "others");
      
      const metrics = getCommuneMetrics(c, currentViewMode);
      
      tr.innerHTML = `
        <td class="text-left" style="font-weight: 700; cursor: pointer;">${c.name}</td>
        <td class="text-right" style="font-weight: bold; color: var(--color-primary);">${formatMoney(metrics.target)}</td>
        <td class="text-right" style="font-weight: bold; color: var(--color-success);">${formatMoney(metrics.ytd)}</td>
        <td class="text-right">${formatMoney(enterpriseStateCentral.target)}</td>
        <td class="text-right">${formatMoney(enterpriseStateCentral.ytd)}</td>
        <td class="text-right">${formatMoney(enterpriseStateLocal.target)}</td>
        <td class="text-right">${formatMoney(enterpriseStateLocal.ytd)}</td>
        <td class="text-right">${formatMoney(enterpriseForeign.target)}</td>
        <td class="text-right">${formatMoney(enterpriseForeign.ytd)}</td>
        <td class="text-right">${formatMoney(enterpriseNonState.target)}</td>
        <td class="text-right">${formatMoney(enterpriseNonState.ytd)}</td>
        <td class="text-right">${formatMoney(pit.target)}</td>
        <td class="text-right">${formatMoney(pit.ytd)}</td>
        <td class="text-right">${formatMoney(registration.target)}</td>
        <td class="text-right">${formatMoney(registration.ytd)}</td>
        <td class="text-right">${formatMoney(landNonAgri.target)}</td>
        <td class="text-right">${formatMoney(landNonAgri.ytd)}</td>
        <td class="text-right">${formatMoney(landRent.target)}</td>
        <td class="text-right">${formatMoney(landRent.ytd)}</td>
        <td class="text-right">${formatMoney(land.target)}</td>
        <td class="text-right">${formatMoney(land.ytd)}</td>
        <td class="text-right">${formatMoney(minerals.target)}</td>
        <td class="text-right">${formatMoney(minerals.ytd)}</td>
        <td class="text-right">${formatMoney(otherBudget.target)}</td>
        <td class="text-right">${formatMoney(otherBudget.ytd)}</td>
        <td class="text-right">${formatMoney(others.target)}</td>
        <td class="text-right">${formatMoney(others.ytd)}</td>
      `;
      
      tr.querySelector("td").addEventListener("click", () => {
        selectedCommuneId = c.id;
        onCommuneSelected();
      });
      
      breakdownBodyEl.appendChild(tr);
    });
    
    // Thêm dòng tổng cộng nếu đang xem chế độ tổng hợp
    if (selectedCommuneId === "tong_hop" && list.length > 0) {
      const agg = getAggregatedData();
      const land = getTaxCatValues(agg, "land");
      const enterpriseStateCentral = getTaxCatValues(agg, "enterpriseStateCentral");
      const enterpriseStateLocal = getTaxCatValues(agg, "enterpriseStateLocal");
      const enterpriseForeign = getTaxCatValues(agg, "enterpriseForeign");
      const enterpriseNonState = getTaxCatValues(agg, "enterpriseNonState");
      const pit = getTaxCatValues(agg, "pit");
      const registration = getTaxCatValues(agg, "registration");
      const landNonAgri = getTaxCatValues(agg, "landNonAgri");
      const landRent = getTaxCatValues(agg, "landRent");
      const minerals = getTaxCatValues(agg, "minerals");
      const otherBudget = getTaxCatValues(agg, "otherBudget");
      const others = getTaxCatValues(agg, "others");
      const metrics = getCommuneMetrics(agg, currentViewMode);
      
      const trTotal = document.createElement("tr");
      trTotal.style.fontWeight = "bold";
      trTotal.style.background = "var(--bg-primary)";
      trTotal.style.borderTop = "2px solid var(--border-color)";
      trTotal.style.color = "#dc2626";
      trTotal.style.fontSize = "1.15em";
      
      trTotal.innerHTML = `
        <td class="text-left" style="color: #dc2626 !important;">TỔNG CỘNG</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(metrics.target)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(metrics.ytd)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(enterpriseStateCentral.target)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(enterpriseStateCentral.ytd)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(enterpriseStateLocal.target)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(enterpriseStateLocal.ytd)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(enterpriseForeign.target)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(enterpriseForeign.ytd)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(enterpriseNonState.target)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(enterpriseNonState.ytd)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(pit.target)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(pit.ytd)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(registration.target)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(registration.ytd)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(landNonAgri.target)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(landNonAgri.ytd)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(landRent.target)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(landRent.ytd)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(land.target)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(land.ytd)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(minerals.target)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(minerals.ytd)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(otherBudget.target)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(otherBudget.ytd)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(others.target)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(others.ytd)}</td>
      `;
      breakdownBodyEl.appendChild(trTotal);
    }

    
    // Cập nhật tiêu đề bảng phân tích
    const breakdownTitleEl = document.getElementById("tax-breakdown-title");
    if (breakdownTitleEl) {
      if (selectedCommuneId === "tong_hop") {
        breakdownTitleEl.textContent = `Bảng số liệu chi tiết theo sắc thuế tại các địa bàn xã (${list.length} Địa bàn)`;
      } else {
        const activeCommune = currentData.communes.find(c => c.id === selectedCommuneId);
        breakdownTitleEl.textContent = `Bảng số liệu chi tiết theo sắc thuế - ${activeCommune ? activeCommune.name : ""}`;
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. Xử lý bảng dữ liệu so sánh các xã
  // -------------------------------------------------------------------------
  // Thiết lập sự kiện sort cho các tiêu đề cột
  document.querySelectorAll("th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const field = th.getAttribute("data-sort");
      if (sortField === field) {
        sortAscending = !sortAscending;
      } else {
        sortField = field;
        sortAscending = true;
      }
      
      // Cập nhật UI tiêu đề
      document.querySelectorAll("th[data-sort]").forEach(item => {
        item.classList.remove("sort-asc", "sort-desc");
      });
      th.classList.add(sortAscending ? "sort-asc" : "sort-desc");
      
      renderTable();
    });
  });

  if (searchInputEl) {
    searchInputEl.addEventListener("input", () => {
      renderTable();
      renderTaxBreakdownTable();
    });
  }

  function renderTable() {
    const query = searchInputEl ? searchInputEl.value.toLowerCase().trim() : "";
    
    // Chuẩn bị dữ liệu hiển thị (dùng hàm trung gian chuyển đổi nguồn thu)
    let list = currentData.communes.map(c => {
      const metrics = getCommuneMetrics(c, currentViewMode);
      const rate = metrics.target > 0 ? (metrics.ytd / metrics.target) * 100 : 0;
      const growth = metrics.lastYearYtd > 0 ? ((metrics.ytd - metrics.lastYearYtd) / metrics.lastYearYtd) * 100 : 0;
      const remaining = Math.max(0, metrics.target - metrics.ytd);
      return {
        id: c.id,
        name: c.name,
        target: metrics.target,
        ytd: metrics.ytd,
        today: metrics.today,
        lastYearYtd: metrics.lastYearYtd,
        ytdRate: rate,
        growth: growth,
        remaining: remaining
      };
    });

    // Lọc theo xã được chọn (nếu không phải "tong_hop")
    if (selectedCommuneId !== "tong_hop") {
      list = list.filter(c => c.id === selectedCommuneId);
    }

    // Lọc theo tìm kiếm (Không phân biệt dấu)
    if (query) {
      list = list.filter(c => cleanName(c.name).includes(cleanName(query)));
    }

    // Sắp xếp
    list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      
      if (typeof valA === "string") {
        return sortAscending 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      }
      
      return sortAscending ? valA - valB : valB - valA;
    });

    // Cập nhật tiêu đề bảng và hiển thị nút hủy lọc
    if (selectedCommuneId === "tong_hop") {
      if (tableTitleEl) tableTitleEl.textContent = "Bảng Tổng hợp Thu Ngân sách 7 Xã (theo thứ tự giảm dần)";
      if (btnClearTableFilter) btnClearTableFilter.style.display = "none";
    } else {
      const activeCommune = currentData.communes.find(c => c.id === selectedCommuneId);
      if (tableTitleEl && activeCommune) {
        tableTitleEl.textContent = `Bảng Chi tiết Thu Ngân sách - ${activeCommune.name}`;
      }
      if (btnClearTableFilter) btnClearTableFilter.style.display = "inline-flex";
    }

    // Render bảng
    tableBodyEl.innerHTML = "";
    
    // In bảng xem trên Web
    list.forEach(c => {
      const tr = document.createElement("tr");
      tr.className = selectedCommuneId === c.id ? "active-row" : "";
      if (selectedCommuneId === c.id) {
        tr.style.backgroundColor = "var(--color-primary-light)";
      }
      
      tr.innerHTML = `
        <td class="text-left" style="font-weight: 700; cursor: pointer;">${c.name}</td>
        <td class="text-center">
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${Math.min(c.ytdRate, 100)}%; background-color: ${c.ytdRate >= 85 ? 'var(--color-success)' : c.ytdRate >= 50 ? 'var(--color-warning)' : 'var(--color-danger)'};"></div>
          </div>
          <span style="font-weight: 700;">${formatPercent(c.ytdRate)}</span>
        </td>
        <td class="text-right">${formatMoney(c.target)}</td>
        <td class="text-right">${formatMoney(c.ytd)}</td>
        <td class="text-right" style="font-weight: bold; color: var(--color-primary);">${formatMoney(c.today)}</td>
        <td class="text-center">
          <span class="percentage-badge ${c.growth >= 0 ? 'up' : 'down'}">
            ${c.growth >= 0 ? '▲ +' : '▼ '}${formatPercent(c.growth)}
          </span>
        </td>
        <td class="text-right" style="color: var(--text-muted);">${formatMoney(c.remaining)}</td>
      `;

      // Click vào hàng để chọn xã đó
      tr.querySelector("td").addEventListener("click", () => {
        selectedCommuneId = c.id;
        onCommuneSelected();
      });

      tableBodyEl.appendChild(tr);
    });

    // Thêm dòng tổng cộng cho bảng xem trên Web nếu hiển thị tất cả xã
    if (selectedCommuneId === "tong_hop" && list.length > 0) {
      const agg = getAggregatedData();
      const aggMetrics = getCommuneMetrics(agg, currentViewMode);
      const aggRate = aggMetrics.target > 0 ? (aggMetrics.ytd / aggMetrics.target) * 100 : 0;
      const aggGrowth = aggMetrics.lastYearYtd > 0 ? ((aggMetrics.ytd - aggMetrics.lastYearYtd) / aggMetrics.lastYearYtd) * 100 : 0;
      const aggRemaining = Math.max(0, aggMetrics.target - aggMetrics.ytd);
      
      const trTotal = document.createElement("tr");
      trTotal.style.fontWeight = "bold";
      trTotal.style.background = "var(--bg-primary)";
      trTotal.style.borderTop = "2px solid var(--border-color)";
      trTotal.style.color = "#dc2626";
      trTotal.style.fontSize = "1.15em";
      
      trTotal.innerHTML = `
        <td class="text-left" style="color: #dc2626 !important;">TỔNG CỘNG</td>
        <td class="text-center" style="color: #dc2626 !important;">
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${Math.min(aggRate, 100)}%; background-color: #dc2626;"></div>
          </div>
          <span style="font-weight: 700; color: #dc2626 !important;">${formatPercent(aggRate)}</span>
        </td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(aggMetrics.target)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(aggMetrics.ytd)}</td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(aggMetrics.today)}</td>
        <td class="text-center" style="color: #dc2626 !important;">
          <span class="percentage-badge" style="background: rgba(220, 38, 38, 0.15); color: #dc2626 !important; font-weight: bold;">
            ${aggGrowth >= 0 ? '▲ +' : '▼ '}${formatPercent(aggGrowth)}
          </span>
        </td>
        <td class="text-right" style="color: #dc2626 !important;">${formatMoney(aggRemaining)}</td>
      `;
      tableBodyEl.appendChild(trTotal);
    }

    // Cập nhật bảng in ấn (legacy - nếu vẫn còn static print-table-body trong DOM)
    // Bảng in hiện tại đã chuyển sang generatePrintReport() dynamic
    const printTableBody = document.getElementById("print-table-body");
    if (printTableBody) {
      printTableBody.innerHTML = "";
      list.forEach((c, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="text-align: center;">${idx + 1}</td>
          <td style="font-weight: bold;">${c.name}</td>
          <td style="text-align: center; font-weight: bold;">${formatPercent(c.ytdRate)}</td>
          <td style="text-align: right;">${formatMoney(c.target)}</td>
          <td style="text-align: right;">${formatMoney(c.ytd)}</td>
          <td style="text-align: right; font-weight: bold;">${formatMoney(c.today)}</td>
          <td style="text-align: center; font-weight: bold;">
            ${c.growth >= 0 ? '+' : ''}${formatPercent(c.growth)}
          </td>
          <td style="text-align: right;">${formatMoney(c.remaining)}</td>
        `;
        printTableBody.appendChild(tr);
      });
      // Thêm dòng tổng cộng cho bảng in nếu hiển thị tất cả xã
      if (selectedCommuneId === "tong_hop" && list.length > 0) {
        const agg = getAggregatedData();
        const aggMetrics = getCommuneMetrics(agg, currentViewMode);
        const aggRate = aggMetrics.target > 0 ? (aggMetrics.ytd / aggMetrics.target) * 100 : 0;
        const aggGrowth = aggMetrics.lastYearYtd > 0 ? ((aggMetrics.ytd - aggMetrics.lastYearYtd) / aggMetrics.lastYearYtd) * 100 : 0;
        const aggRemaining = Math.max(0, aggMetrics.target - aggMetrics.ytd);
        const trTotal = document.createElement("tr");
        trTotal.style.fontWeight = "bold";
        trTotal.style.color = "#dc2626";
        trTotal.innerHTML = `
          <td style="text-align: center; color: #dc2626 !important;">-</td>
          <td style="color: #dc2626 !important;">TỔNG CỘNG</td>
          <td style="text-align: center; color: #dc2626 !important;">${formatPercent(aggRate)}</td>
          <td style="text-align: right; color: #dc2626 !important;">${formatMoney(aggMetrics.target)}</td>
          <td style="text-align: right; color: #dc2626 !important;">${formatMoney(aggMetrics.ytd)}</td>
          <td style="text-align: right; color: #dc2626 !important;">${formatMoney(aggMetrics.today)}</td>
          <td style="text-align: center; color: #dc2626 !important;">
            ${aggGrowth >= 0 ? '+' : ''}${formatPercent(aggGrowth)}
          </td>
          <td style="text-align: right; color: #dc2626 !important;">${formatMoney(aggRemaining)}</td>
        `;
        printTableBody.appendChild(trTotal);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 7. Event Listeners cho In ấn, Xuất PDF và Khôi phục
  // -------------------------------------------------------------------------
  overlay.addEventListener("click", () => {
    closePeriodicPanel();
  });

  // Nút In trực tiếp
  printBtn.addEventListener("click", () => {
    generatePrintReport();
    window.print();
  });

  // Nút Xuất PDF - tải file PDF về máy
  const exportPdfBtn = document.getElementById("btn-export-pdf");
  if (exportPdfBtn) {
    exportPdfBtn.addEventListener("click", () => {
      exportPDF();
    });
  }


  // Nut Chot ky
  const finalizeBtn = document.getElementById("btn-finalize");
  if (finalizeBtn) {
    finalizeBtn.addEventListener("click", () => {
      window.finalizeReportingPeriod();
    });
  }

  // Nut Luu lai lam du lieu goc
  const saveBaselineBtn = document.getElementById("btn-save-baseline");
  if (saveBaselineBtn) {
    saveBaselineBtn.addEventListener("click", async () => {
      try {
        // 1. Luu trang thai hien tai lam baseline trong localStorage
        localStorage.setItem("thue_co_so_13_baseline", JSON.stringify(currentData));
        localStorage.setItem("thue_co_so_13_current_state", JSON.stringify(currentData));
        originalBaseline = JSON.parse(JSON.stringify(currentData));
        
        // Cập nhật cả lịch sử để khi chuyển ngày qua lại không bị load lại bản ghi cũ sai lệch
        saveSnapshot("Lưu thủ công (Dữ liệu gốc)", "Manual");

        // 2. Tao noi dung tep data_v1_8.js (Bao gồm cả dữ liệu hiện tại và Lịch sử để đồng bộ đa thiết bị)
        const now = new Date().toLocaleDateString('vi-VN');
        const historyData = localStorage.getItem("thue_co_so_13_history") || "[]";
        
        const fileContent = `// Budget data and history for 7 communes
// Saved by admin on ${now}

const BUDGET_DATA = ${JSON.stringify(currentData, null, 2)};
const BUDGET_HISTORY = ${historyData};

window.BUDGET_DATA = BUDGET_DATA;
window.BUDGET_HISTORY = BUDGET_HISTORY;
`;

        // 3. Gui len server luu thang vao thu muc du an (khong tai ve)
        let serverSaved = false;
        try {
          const res = await fetch("/save-data", {
            method: "POST",
            headers: { "Content-Type": "text/plain; charset=utf-8" },
            body: fileContent
          });
          if (res.ok) {
            const result = await res.json();
            serverSaved = true;
            showToast("Da luu vao du an thanh cong!");
            alert("Da luu du lieu thanh cong!\n\n• Tep data_v1_8.js da duoc cap nhat trong thu muc du an.\n• Ban sao luu trong: " + (result.backup || "data/"));
          }
        } catch (fetchErr) {
          console.warn("POST /save-data khong kha dung:", fetchErr.message);
        }

        // 4. Fallback: neu server chua ho tro, tai ve nhu cu
        if (!serverSaved) {
          const blob = new Blob([fileContent], { type: "application/javascript;charset=utf-8" });
          const url  = URL.createObjectURL(blob);
          const a    = document.createElement("a");
          a.href     = url;
          a.download = "data_v1_8.js";
          a.click();
          URL.revokeObjectURL(url);
          showToast("Da luu lam du lieu goc thanh cong!");
        }
      } catch (err) {
        alert("Loi khi luu du lieu goc: " + err.message);
      }
    });
  }

  // Nút Khôi phục về số 0 (Xóa trắng)
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (confirm(`Xác nhận XÓA TRẮNG toàn bộ số liệu của ngày ${currentData.metadata.reportDate} về 0đ?\n\nThao tác này giúp bạn làm sạch dữ liệu để nhập lại từ đầu.`)) {
        currentData.communes.forEach(c => {
          Object.keys(c.provinceTax.details).forEach(k => {
            c.provinceTax.details[k] = { target: 0, ytd: 0, lastYearYtd: 0, periodStartYtd: c.provinceTax.details[k].periodStartYtd || 0 };
          });
          Object.keys(c.baseTax.details).forEach(k => {
            c.baseTax.details[k] = { target: 0, ytd: 0, lastYearYtd: 0, periodStartYtd: c.baseTax.details[k].periodStartYtd || 0 };
          });
          updateCommuneDerivedFields(c, 10, null);
        });
        saveSnapshot("Xóa trắng về 0đ", "Manual");
        onCommuneSelected();
        renderSidebar();
        showToast("Đã xóa trắng số liệu thành công!");
      }
    });
  }

  // -------------------------------------------------------------------------
  // Hàm xuất PDF - Blob URL approach (đáng tin cậy 100%)
  // Lý do: html2canvas không capture được Vietnamese fonts + inline styles phức tạp
  // Giải pháp: tạo HTML document hoàn chỉnh → Blob URL → mở tab mới → print-to-PDF
  // -------------------------------------------------------------------------
  function exportPDF() {
    const exportBtn = document.getElementById("btn-export-pdf");

    // 1. Cập nhật nội dung báo cáo mới nhất
    generatePrintReport();

    const sourceContainer = document.getElementById("print-report-container");
    if (!sourceContainer || !sourceContainer.innerHTML.trim()) {
      alert("Không có nội dung báo cáo. Vui lòng thử lại!");
      return;
    }

    // 2. Tạo tên file
    const rawDate = reportDatePickerEl.value || "2026-06-14";
    const [y, m, d] = rawDate.split("-");
    const dateLabel = `${d || "14"}/${m || "06"}/${y || "2026"}`;
    const dateStr = `${d || "14"}${m || "06"}${y || "2026"}`;
    const communeRaw = selectedCommuneId === "tong_hop"
      ? "TongHop7Xa"
      : (currentData.communes.find(c => c.id === selectedCommuneId)?.name || "BaoCao")
          .replace(/Xã\s*/gi, "").replace(/\s+/g, "");
    const filename = `BaoCao_ThuNganSach_TCS13_${communeRaw}_${dateStr}`;

    // 3. Lấy nội dung HTML báo cáo đã render
    const reportBodyHTML = sourceContainer.innerHTML;

    // 4. Tạo tài liệu HTML hoàn chỉnh, độc lập, có CSS in ấn chuẩn A4
    const fullHTML = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${filename}</title>
  <style>
    /* Reset */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* Giao diện xem trước (screen) */
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 11pt;
      color: #000;
      background: #e8e8e8;
      padding: 0;
    }

    /* Toolbar xem trước */
    .toolbar {
      position: fixed;
      top: 0; left: 0; right: 0;
      background: linear-gradient(135deg, #059669, #047857);
      color: #fff;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      gap: 15px;
      z-index: 9999;
      font-family: -apple-system, 'Segoe UI', sans-serif;
      box-shadow: 0 3px 12px rgba(0,0,0,0.3);
    }
    .toolbar-title {
      font-weight: 700;
      font-size: 14px;
      flex: 1;
    }
    .toolbar-hint {
      font-size: 12px;
      opacity: 0.9;
    }
    .btn-print-now {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 22px;
      background: #fff;
      color: #059669;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .btn-print-now:hover {
      background: #f0fdf4;
      transform: scale(1.04);
    }
    .btn-close {
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.4);
      color: #fff;
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
    }

    /* Khung giấy A4 chuẩn Nghị định 30/2020/NĐ-CP */
    .page-wrapper {
      margin: 70px auto 30px;
      background: #fff;
      width: 210mm;
      min-height: 297mm;
      padding: 20mm 20mm 20mm 30mm; /* trên: 20mm, phải: 20mm, dưới: 20mm, trái: 30mm */
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      position: relative;
    }

    /* Nội dung báo cáo (copy lại từ generatePrintReport) */
    table { border-collapse: collapse; width: 100%; }
    th, td { padding: 5px 6px; font-size: 10pt; }
    p { line-height: 1.55; margin-bottom: 10px; }
    h3 { text-align: center; margin-bottom: 15px; }
    h4 { margin-bottom: 6px; }
    ul, ol { margin-left: 20px; margin-bottom: 12px; }
    li { margin-bottom: 5px; line-height: 1.5; }
    strong { font-weight: bold; }

    /* In ấn - CSS Paged Media chuẩn theo Nghị định 30/2020/NĐ-CP */
    @page {
      size: A4 portrait;
      margin: 20mm 20mm 20mm 30mm;
      @top-center {
        content: counter(page); /* Đánh số trang giữa lề trên, số Ả Rập */
      }
    }
    @page :first {
      @top-center {
        content: normal; /* Không hiển thị trang đầu */
      }
    }
    
    @media print {
      body { background: #fff; }
      .toolbar { display: none !important; }
      .page-wrapper {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        box-shadow: none !important;
        min-height: unset !important;
      }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
      h4 { page-break-after: avoid; }
      p { orphans: 3; widows: 3; }
    }
  </style>
</head>
<body>

  <!-- Toolbar xem trước (ẩn khi in) -->
  <div class="toolbar">
    <div class="toolbar-title">📄 Báo cáo Thu ngân sách hàng ngày - TCS13 (${dateLabel})</div>
    <span class="toolbar-hint">💡 Trong hộp thoại in → chọn <strong>Lưu thành PDF</strong></span>
    <button class="btn-print-now" onclick="window.print()">🖨️&nbsp; In / Lưu PDF</button>
    <button class="btn-close" onclick="window.close()">✕ Đóng</button>
  </div>

  <!-- Khung giấy A4 -->
  <div class="page-wrapper">
    ${reportBodyHTML}
  </div>

  <script>
    // Tự động mở hộp thoại in sau khi trang tải xong
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 900);
    });
  </script>
</body>
</html>`;

    // 5. Tạo Blob URL và mở tab mới
    const blob = new Blob([fullHTML], { type: "text/html; charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);

    const newTab = window.open(blobUrl, "_blank");

    if (!newTab) {
      // Popup bị chặn - fallback: tạo link download HTML
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename + ".html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast("⚠️ Popup bị chặn. Đã tải file HTML — mở và nhấn Ctrl+P để xuất PDF.");
    } else {
      showToast(`✅ Đã mở báo cáo trong tab mới. Chọn "Lưu thành PDF" để lưu file.`);
      // Giải phóng bộ nhớ sau 60 giây
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    }
  }




  // Helper formatting functions
  function formatMoney(amount) {
    const millionVal = Math.round(amount / 1000000);
    return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(millionVal);
  }

  function formatMoneyNoSuffix(amount) {
    const millionVal = Math.round(amount / 1000000);
    return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(millionVal);
  }

  function formatPercent(value, decimals = 1) {
    if (value === undefined || value === null || isNaN(value)) return "0%";
    return formatPercentNum(value, decimals) + "%";
  }

  function formatPercentNum(value, decimals = 1) {
    if (value === undefined || value === null || isNaN(value)) return "0";
    return value.toFixed(decimals).replace(".", ",");
  }

  // Hàm tạo báo cáo in ấn chính thức hành chính nhà nước (dạng chữ kèm bảng)
  function generatePrintReport() {
    const reportContainer = document.getElementById("print-report-container");
    if (!reportContainer) return;

    const active = getActiveEntity();
    const rawDatePickerDate = reportDatePickerEl.value; // YYYY-MM-DD
    const parts = rawDatePickerDate.split('-');
    const currYear = parts[0] || "2026";
    const currMonth = parts[1] || "06";
    const currDay = parts[2] || "14";

    const formattedDate = `${currDay}/${currMonth}/${currYear}`;
    
    // Tính toán số liệu phân phối giữa Thuế Tỉnh và Thuế Cơ Sở
    let provTarget = 0, provYtd = 0, baseTarget = 0, baseYtd = 0;
    if (selectedCommuneId === "tong_hop") {
      currentData.communes.forEach(c => {
        provTarget += c.provinceTax.target;
        provYtd += c.provinceTax.ytd;
        baseTarget += c.baseTax.target;
        baseYtd += c.baseTax.ytd;
      });
    } else {
      const c = currentData.communes.find(comm => comm.id === selectedCommuneId);
      if (c) {
        provTarget = c.provinceTax.target;
        provYtd = c.provinceTax.ytd;
        baseTarget = c.baseTax.target;
        baseYtd = c.baseTax.ytd;
      }
    }
    
    const provRate = provTarget > 0 ? (provYtd / provTarget) * 100 : 0;
    const baseRate = baseTarget > 0 ? (baseYtd / baseTarget) * 100 : 0;
    const totalTarget = provTarget + baseTarget;
    const totalYtd = provYtd + baseYtd;
    const totalRate = totalTarget > 0 ? (totalYtd / totalTarget) * 100 : 0;
    
    // Lấy số liệu cùng kỳ năm ngoái để so sánh tăng trưởng
    let provLastYearYtd = 0, baseLastYearYtd = 0;
    if (selectedCommuneId === "tong_hop") {
      currentData.communes.forEach(c => {
        provLastYearYtd += c.provinceTax.lastYearYtd;
        baseLastYearYtd += c.baseTax.lastYearYtd;
      });
    } else {
      const c = currentData.communes.find(comm => comm.id === selectedCommuneId);
      if (c) {
        provLastYearYtd = c.provinceTax.lastYearYtd;
        baseLastYearYtd = c.baseTax.lastYearYtd;
      }
    }
    const provGrowth = provLastYearYtd > 0 ? ((provYtd - provLastYearYtd) / provLastYearYtd) * 100 : 0;
    const baseGrowth = baseLastYearYtd > 0 ? ((baseYtd - baseLastYearYtd) / baseLastYearYtd) * 100 : 0;
    const totalLastYearYtd = provLastYearYtd + baseLastYearYtd;
    const totalGrowth = totalLastYearYtd > 0 ? ((totalYtd - totalLastYearYtd) / totalLastYearYtd) * 100 : 0;

    // 1. Phân tích chi tiết từng xã (nếu đang ở chế độ tổng hợp 7 xã)
    let communeAnalysisHTML = "";
    if (selectedCommuneId === "tong_hop") {
      communeAnalysisHTML += `
        <h4 style="font-size: 11pt; font-weight: bold; margin-top: 15px; margin-bottom: 5px; margin-left: 1.27cm; text-transform: uppercase; color: #000;">
          II. Phân tích chi tiết tình hình thu ngân sách theo từng địa bàn xã
        </h4>
        <p style="text-indent: 1.27cm; text-align: justify; margin-bottom: 10px; color: #000; line-height: 1.5;">
          Tình hình thực hiện dự toán thu ngân sách có sự phân hóa rõ rệt giữa các địa bàn trực thuộc Thuế cơ sở 13. Cụ thể kết quả chi tiết từng đơn vị như sau:
        </p>
        <ul style="margin-left: 1.27cm; margin-bottom: 15px; line-height: 1.5; color: #000;">
      `;
      currentData.communes.forEach((c, idx) => {
        const cMetrics = getCommuneMetrics(c, currentViewMode);
        const cRate = cMetrics.target > 0 ? (cMetrics.ytd / cMetrics.target) * 100 : 0;
        const cGrowth = cMetrics.lastYearYtd > 0 ? ((cMetrics.ytd - cMetrics.lastYearYtd) / cMetrics.lastYearYtd) * 100 : 0;
        communeAnalysisHTML += `
          <li style="margin-bottom: 5px;">
            <strong>${idx + 1}. ${c.name}</strong>: Chỉ tiêu dự toán được giao cả năm là ${formatMoneyNoSuffix(cMetrics.target)} triệu đồng; lũy kế thực thu đạt ${formatMoneyNoSuffix(cMetrics.ytd)} triệu đồng, đạt tỷ lệ tiến độ <strong>${formatPercent(cRate)}</strong>. So với thực thu cùng kỳ năm trước, tốc độ tăng trưởng đạt <strong>${cGrowth >= 0 ? '+' : ''}${formatPercent(cGrowth)}</strong>.
          </li>
        `;
      });
      
      const sortedCommunes = [...currentData.communes].map(c => {
        const cMetrics = getCommuneMetrics(c, currentViewMode);
        return { name: c.name, rate: cMetrics.target > 0 ? (cMetrics.ytd / cMetrics.target) * 100 : 0 };
      }).sort((a, b) => b.rate - a.rate);
      
      communeAnalysisHTML += `
        </ul>
        <p style="text-indent: 1.27cm; text-align: justify; margin-bottom: 15px; color: #000; line-height: 1.5;">
          Địa bàn có tiến độ thực hiện đạt tỷ lệ cao nhất toàn khu vực là <strong>${sortedCommunes[0].name}</strong> (hoàn thành đạt tỷ lệ ${formatPercent(sortedCommunes[0].rate)} dự toán năm). Đơn vị có tiến độ thu chậm nhất là <strong>${sortedCommunes[sortedCommunes.length - 1].name}</strong> (mới chỉ đạt ${formatPercent(sortedCommunes[sortedCommunes.length - 1].rate)} dự toán năm), cần tập trung đôn đốc chỉ đạo sát sao trong thời gian tới.
        </p>
      `;
    } else {
      communeAnalysisHTML += `
        <h4 style="font-size: 11pt; font-weight: bold; margin-top: 15px; margin-bottom: 5px; margin-left: 1.27cm; text-transform: uppercase; color: #000;">
          II. Phân tích chi tiết tình hình thu ngân sách trên địa bàn ${active.name}
        </h4>
        <p style="text-indent: 1.27cm; text-align: justify; margin-bottom: 15px; color: #000; line-height: 1.5;">
          Địa bàn <strong>${active.name}</strong> được giao chỉ tiêu dự toán thu ngân sách cả năm là ${formatMoneyNoSuffix(active.target)} triệu đồng. Đến nay, đơn vị đã thực hiện thu nộp ngân sách lũy kế đạt ${formatMoneyNoSuffix(active.ytd)} triệu đồng, hoàn thành đạt tỷ lệ tiến độ <strong>${formatPercent(totalRate)}</strong> dự toán năm. So với cùng kỳ năm ngoái, mức độ thu đạt tỷ lệ tăng trưởng <strong>${totalGrowth >= 0 ? '+' : ''}${formatPercent(totalGrowth)}</strong>.
        </p>
      `;
    }

    // 2. Phân tích chi tiết từng sắc thuế trong từng xã
    let taxCategoriesAnalysisHTML = `
      <h4 style="font-size: 11pt; font-weight: bold; margin-top: 15px; margin-bottom: 5px; margin-left: 1.27cm; text-transform: uppercase; color: #000;">
        III. Phân tích chi tiết theo từng sắc thuế chính trên địa bàn
      </h4>
      <p style="text-indent: 1.27cm; text-align: justify; margin-bottom: 10px; color: #000; line-height: 1.5;">
        Đánh giá tiến độ thực hiện đối với các nguồn thu, sắc thuế cụ thể như sau:
      </p>
      <ul style="margin-left: 1.27cm; margin-bottom: 15px; line-height: 1.5; color: #000;">
    `;

    const categoriesList = [
      { key: "enterpriseStateCentral", name: "Thuế DNNN Trung ương" },
      { key: "enterpriseStateLocal", name: "Thuế DNNN Địa phương" },
      { key: "enterpriseForeign", name: "Thuế DN có vốn ĐTNN" },
      { key: "enterpriseNonState", name: "Thuế Ngoài quốc doanh" },
      { key: "pit", name: "Thuế Thu nhập cá nhân" },
      { key: "registration", name: "Lệ phí trước bạ" },
      { key: "landNonAgri", name: "Thuế SDĐ phi NN" },
      { key: "landRent", name: "Thu tiền cho thuê đất..." },
      { key: "land", name: "Tiền sử dụng đất" },
      { key: "minerals", name: "Thu CQ KTKS" },
      { key: "otherBudget", name: "Thu khác ngân sách" },
      { key: "others", name: "Phí, lệ phí & Thu khác" }
    ];


    categoriesList.forEach((cat, idx) => {
      let catTarget = 0, catYtd = 0, catLastYearYtd = 0;
      if (selectedCommuneId === "tong_hop") {
        currentData.communes.forEach(c => {
          const provVal = c.provinceTax.details[cat.key];
          const baseVal = c.baseTax.details[cat.key];
          
          if (currentViewMode === "province") {
            catTarget += provVal.target;
            catYtd += provVal.ytd;
            catLastYearYtd += provVal.lastYearYtd || 0;
          } else if (currentViewMode === "base") {
            catTarget += baseVal.target;
            catYtd += baseVal.ytd;
            catLastYearYtd += baseVal.lastYearYtd || 0;
          } else {
            catTarget += provVal.target + baseVal.target;
            catYtd += provVal.ytd + baseVal.ytd;
            catLastYearYtd += (provVal.lastYearYtd || 0) + (baseVal.lastYearYtd || 0);
          }
        });
      } else {
        const c = currentData.communes.find(comm => comm.id === selectedCommuneId);
        if (c) {
          const provVal = c.provinceTax.details[cat.key];
          const baseVal = c.baseTax.details[cat.key];
          if (currentViewMode === "province") {
            catTarget = provVal.target;
            catYtd = provVal.ytd;
            catLastYearYtd = provVal.lastYearYtd || 0;
          } else if (currentViewMode === "base") {
            catTarget = baseVal.target;
            catYtd = baseVal.ytd;
            catLastYearYtd = baseVal.lastYearYtd || 0;
          } else {
            catTarget = provVal.target + baseVal.target;
            catYtd = provVal.ytd + baseVal.ytd;
            catLastYearYtd = (provVal.lastYearYtd || 0) + (baseVal.lastYearYtd || 0);
          }
        }
      }

      const catRate = catTarget > 0 ? (catYtd / catTarget) * 100 : 0;
      const catGrowth = catLastYearYtd > 0 ? ((catYtd - catLastYearYtd) / catLastYearYtd) * 100 : 0;
      
      taxCategoriesAnalysisHTML += `
        <li style="margin-bottom: 5px;">
          <strong>${idx + 1}. ${cat.name}</strong>: Dự toán cả năm là ${formatMoneyNoSuffix(catTarget)} triệu đồng; lũy kế thực thu đến nay đạt ${formatMoneyNoSuffix(catYtd)} triệu đồng, hoàn thành <strong>${formatPercent(catRate)}</strong> chỉ tiêu. So với cùng kỳ năm ngoái, sắc thuế này đạt tốc độ tăng trưởng là <strong>${catGrowth >= 0 ? '+' : ''}${formatPercent(catGrowth)}</strong>.
        </li>
      `;
    });

    taxCategoriesAnalysisHTML += `</ul>`;

    // 3. Nội dung tham mưu cho UBND xã duy trì Ban chỉ đạo chống thất thu
    const recommendationsHTML = `
      <h4 style="font-size: 11pt; font-weight: bold; margin-top: 15px; margin-bottom: 5px; margin-left: 1.27cm; text-transform: uppercase; color: #000;">
        IV. Đề xuất tham mưu công tác chống thất thu ngân sách nhà nước
      </h4>
      <p style="text-indent: 1.27cm; text-align: justify; margin-bottom: 10px; color: #000; line-height: 1.5;">
        Để duy trì sự ổn định, chống thất thoát nguồn thu và đảm bảo hoàn thành vượt mức chỉ tiêu thu ngân sách năm 2026, Thuế cơ sở 13 kính đề nghị Ủy ban nhân dân các xã tiếp tục duy trì hoạt động thường xuyên của <strong>Ban chỉ đạo chống thất thu ngân sách địa phương</strong>, tập trung chỉ đạo các phòng ban và tổ công tác thực hiện tốt các giải pháp trọng tâm đối với các lĩnh vực rủi ro cao sau:
      </p>
      <ol style="margin-left: 1.27cm; margin-bottom: 25px; line-height: 1.5; color: #000;">
        <li style="margin-bottom: 5px;">
          <strong>Quản lý chặt chẽ nguồn thu tiền sử dụng đất (lĩnh vực rủi ro cao)</strong>: Chỉ đạo cán bộ địa chính xã phối hợp chặt chẽ với cơ quan Thuế để kiểm tra nguồn gốc đất, chống khai thấp giá trị giao dịch chuyển nhượng quyền sử dụng đất thực tế so với khung giá để trốn thuế TNCN và lệ phí trước bạ.
        </li>
        <li style="margin-bottom: 5px;">
          <strong>Chống thất thu khu vực kinh tế ngoài quốc doanh</strong>: Tăng cường rà soát, đối chiếu doanh thu thực tế đối với các hộ sản xuất, kinh doanh, dịch vụ thương mại trên địa bàn nhằm kịp thời điều chỉnh mức thuế khoán sát với thực tế, chống khai thấp doanh thu.
        </li>
        <li style="margin-bottom: 5px;">
          <strong>Đôn đốc thu hồi các khoản nợ thuế đọng kéo dài</strong>: Thành lập tổ liên ngành đôn đốc thu nợ thuế sử dụng đất phi nông nghiệp và các khoản chậm nộp đối với các hộ gia đình, cá nhân dây dưa chậm nộp nhằm kịp thời huy động nguồn lực nộp vào kho bạc nhà nước.
        </li>
      </ol>
    `;

    reportContainer.innerHTML = `
      <div style="font-family: 'Times New Roman', Times, serif; color: #000; line-height: 1.4; font-size: 11pt;">
        <table style="width: 100%; border: none !important; margin-bottom: 20px; border-collapse: collapse;">
          <tr style="border: none !important;">
            <td style="width: 45%; text-align: center; border: none !important; padding: 0; font-size: 9.5pt; line-height: 1.3; color: #000; vertical-align: top;">
              THUẾ TỈNH LÂM ĐỒNG<br>
              <strong style="text-transform: uppercase;">THUẾ CƠ SỞ 13 TỈNH LÂM ĐỒNG</strong><br>
              <span>Số: &nbsp; &nbsp; &nbsp; /TCS13-NVDTPC</span>
            </td>
            <td style="width: 55%; text-align: center; border: none !important; padding: 0; font-size: 10pt; line-height: 1.3; color: #000; vertical-align: top;">
              <strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><br>
              <strong style="text-decoration: underline;">Độc lập - Tự do - Hạnh phúc</strong>
            </td>
          </tr>
        </table>
        <div style="text-align: right; font-style: italic; font-size: 10pt; margin-bottom: 25px; color: #000;">
          Cư Jút, ngày ${currDay} tháng ${currMonth} năm ${currYear}
        </div>

        <h3 style="text-align: center; font-size: 13pt; font-weight: bold; margin-bottom: 20px; text-transform: uppercase; color: #000;">
          BÁO CÁO TÌNH HÌNH THU NGÂN SÁCH NHÀ NƯỚC HÀNG NGÀY
        </h3>
        
        <p style="font-size: 10.5pt; font-style: italic; margin-bottom: 15px; text-align: center; color: #000;">
          (Địa bàn báo cáo: ${active.name} - Ngày cập nhật: ${formattedDate})
        </p>

        <p style="text-indent: 1.27cm; text-align: justify; margin-bottom: 15px; line-height: 1.5; color: #000;">
          Căn cứ vào kết quả cập nhật số liệu thu ngân sách nhà nước thực tế đến ngày ${formattedDate}, Thuế cơ sở 13 tỉnh Lâm Đồng xin báo cáo chi tiết tình hình thực hiện dự toán thu ngân sách nhà nước trên địa bàn như sau:
        </p>

        <h4 style="font-size: 11pt; font-weight: bold; margin-top: 15px; margin-bottom: 5px; margin-left: 1.27cm; text-transform: uppercase;">
          I. Đánh giá chung tình hình thực hiện dự toán
        </h4>
        <p style="text-indent: 1.27cm; text-align: justify; margin-bottom: 15px; line-height: 1.5; color: #000;">
          Tổng số thu ngân sách nhà nước lũy kế thực hiện trên địa bàn đạt <strong>${formatMoneyNoSuffix(totalYtd)}</strong> triệu đồng, hoàn thành đạt tỷ lệ <strong>${formatPercent(totalRate)}</strong> so với chỉ tiêu dự toán được giao (${formatMoneyNoSuffix(totalTarget)} triệu đồng). So với số liệu thực thu cùng kỳ năm ngoái (lũy kế đạt ${formatMoneyNoSuffix(totalLastYearYtd)} triệu đồng), tiến độ thu ngân sách ghi nhận mức tăng trưởng đạt <strong>${totalGrowth >= 0 ? '+' : ''}${formatPercent(totalGrowth)}</strong>. Số phát sinh trong kỳ cập nhật báo cáo đạt ${formatMoneyNoSuffix(active.today)} triệu đồng.
        </p>

        <!-- Bảng kẻ chỉ liền phân chia thuế tỉnh và thuế cơ sở (không dùng màu sắc) -->
        <div style="margin: 15px 0; width: 100%;">
          <p style="font-size: 9pt; font-weight: bold; font-style: italic; margin-bottom: 5px; text-align: right; color: #000;">
            Đơn vị tính: Triệu đồng
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 9.5pt; border: 1px solid #000 !important; color: #000;">
            <thead>
              <tr>
                <th style="border: 1px solid #000 !important; padding: 6px; text-align: center; background: #f2f2f2 !important; font-weight: bold; text-transform: uppercase; color: #000;">Cơ quan quản lý nguồn thu</th>
                <th style="border: 1px solid #000 !important; padding: 6px; text-align: center; background: #f2f2f2 !important; font-weight: bold; text-transform: uppercase; color: #000;">Dự toán năm</th>
                <th style="border: 1px solid #000 !important; padding: 6px; text-align: center; background: #f2f2f2 !important; font-weight: bold; text-transform: uppercase; color: #000;">Lũy kế thực thu</th>
                <th style="border: 1px solid #000 !important; padding: 6px; text-align: center; background: #f2f2f2 !important; font-weight: bold; text-transform: uppercase; color: #000;">Tiến độ đạt</th>
                <th style="border: 1px solid #000 !important; padding: 6px; text-align: center; background: #f2f2f2 !important; font-weight: bold; text-transform: uppercase; color: #000;">So với cùng kỳ</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="border: 1px solid #000 !important; padding: 6px; font-weight: bold; color: #000;">1. Thuế Tỉnh (Phòng quản lý doanh nghiệp)</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: right; color: #000;">${formatMoneyNoSuffix(provTarget)}</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: right; color: #000;">${formatMoneyNoSuffix(provYtd)}</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: center; font-weight: bold; color: #000;">${formatPercent(provRate)}</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: center; color: #000;">${provGrowth >= 0 ? '+' : ''}${formatPercent(provGrowth)}</td>
              </tr>
              <tr>
                <td style="border: 1px solid #000 !important; padding: 6px; font-weight: bold; color: #000;">2. Thuế Cơ Sở (Chi cục trực tiếp quản lý)</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: right; color: #000;">${formatMoneyNoSuffix(baseTarget)}</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: right; color: #000;">${formatMoneyNoSuffix(baseYtd)}</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: center; font-weight: bold; color: #000;">${formatPercent(baseRate)}</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: center; color: #000;">${baseGrowth >= 0 ? '+' : ''}${formatPercent(baseGrowth)}</td>
              </tr>
              <tr style="font-weight: bold; background: #f2f2f2;">
                <td style="border: 1px solid #000 !important; padding: 6px; text-transform: uppercase; color: #000;">TỔNG CỘNG địa bàn</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: right; color: #000;">${formatMoneyNoSuffix(totalTarget)}</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: right; color: #000;">${formatMoneyNoSuffix(totalYtd)}</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: center; color: #000;">${formatPercent(totalRate)}</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: center; color: #000;">${totalGrowth >= 0 ? '+' : ''}${formatPercent(totalGrowth)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        ${communeAnalysisHTML}

        ${taxCategoriesAnalysisHTML}

        ${recommendationsHTML}

        <!-- Bảng tổng hợp số liệu 7 xã chi tiết (kèm theo báo cáo) -->
        <div style="margin-top: 20px; page-break-inside: avoid;">
          <h4 style="font-size: 11pt; font-weight: bold; margin-bottom: 8px; text-transform: uppercase; color: #000; text-align: center;">
            PHỤ LỤC: BẢNG TỔNG HỢP THU NGÂN SÁCH NHÀ NƯỚC 7 ĐỊA BÀN XÃ
          </h4>
          <p style="font-size: 9pt; text-align: center; font-style: italic; color: #000; margin-bottom: 6px;">
            (Chế độ xem: ${currentViewMode === 'combined' ? 'Tổng 2 CQT' : currentViewMode === 'province' ? 'Thuế Tỉnh' : 'Thuế Cơ Sở'} - Tính đến ngày ${formattedDate})
          </p>
          <p style="font-size: 9pt; font-weight: bold; font-style: italic; margin-bottom: 5px; text-align: right; color: #000;">
            Đơn vị tính: Triệu đồng
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 9pt; color: #000; border: 1px solid #000;">
            <thead>
              <tr style="background: #dce6f1;">
                <th style="border: 1px solid #000; padding: 5px 4px; text-align: center; font-weight: bold; color: #000;">STT</th>
                <th style="border: 1px solid #000; padding: 5px 6px; text-align: center; font-weight: bold; color: #000;">Tên địa bàn xã</th>
                <th style="border: 1px solid #000; padding: 5px 4px; text-align: center; font-weight: bold; color: #000;">Dự toán năm</th>
                <th style="border: 1px solid #000; padding: 5px 4px; text-align: center; font-weight: bold; color: #000;">Lũy kế thực thu</th>
                <th style="border: 1px solid #000; padding: 5px 4px; text-align: center; font-weight: bold; color: #000;">Thu trong kỳ</th>
                <th style="border: 1px solid #000; padding: 5px 4px; text-align: center; font-weight: bold; color: #000;">Tiến độ (%)</th>
                <th style="border: 1px solid #000; padding: 5px 4px; text-align: center; font-weight: bold; color: #000;">So với CK (%)</th>
                <th style="border: 1px solid #000; padding: 5px 4px; text-align: center; font-weight: bold; color: #000;">Còn phải thu</th>
              </tr>
            </thead>
            <tbody>
              ${(() => {
                let rows = '';
                const sortedList = [...currentData.communes].map(c => {
                  const m = getCommuneMetrics(c, currentViewMode);
                  const rate = m.target > 0 ? (m.ytd / m.target) * 100 : 0;
                  const growth = m.lastYearYtd > 0 ? ((m.ytd - m.lastYearYtd) / m.lastYearYtd) * 100 : 0;
                  const remaining = Math.max(0, m.target - m.ytd);
                  return { name: c.name, target: m.target, ytd: m.ytd, today: m.today, rate, growth, remaining };
                }).sort((a, b) => b.ytd - a.ytd);

                sortedList.forEach((c, idx) => {
                  const bgStyle = idx % 2 === 1 ? 'background: #f9f9f9;' : '';
                  rows += `
                    <tr style="${bgStyle}">
                      <td style="border: 1px solid #000; padding: 5px 4px; text-align: center; color: #000;">${idx + 1}</td>
                      <td style="border: 1px solid #000; padding: 5px 6px; font-weight: bold; color: #000;">${c.name}</td>
                      <td style="border: 1px solid #000; padding: 5px 4px; text-align: right; color: #000;">${formatMoneyNoSuffix(c.target)}</td>
                      <td style="border: 1px solid #000; padding: 5px 4px; text-align: right; font-weight: bold; color: #000;">${formatMoneyNoSuffix(c.ytd)}</td>
                      <td style="border: 1px solid #000; padding: 5px 4px; text-align: right; color: #000;">${formatMoneyNoSuffix(c.today)}</td>
                      <td style="border: 1px solid #000; padding: 5px 4px; text-align: center; font-weight: bold; color: #000;">${formatPercent(c.rate)}</td>
                      <td style="border: 1px solid #000; padding: 5px 4px; text-align: center; color: #000;">${c.growth >= 0 ? '+' : ''}${formatPercent(c.growth)}</td>
                      <td style="border: 1px solid #000; padding: 5px 4px; text-align: right; color: #000;">${formatMoneyNoSuffix(c.remaining)}</td>
                    </tr>
                  `;
                });

                // Dòng tổng cộng
                const agg = getAggregatedData();
                const aggM = getCommuneMetrics(agg, currentViewMode);
                const aggRate = aggM.target > 0 ? (aggM.ytd / aggM.target) * 100 : 0;
                const aggGrowth = aggM.lastYearYtd > 0 ? ((aggM.ytd - aggM.lastYearYtd) / aggM.lastYearYtd) * 100 : 0;
                const aggRemaining = Math.max(0, aggM.target - aggM.ytd);

                rows += `
                  <tr style="background: #dce6f1; font-weight: bold;">
                    <td style="border: 1px solid #000; padding: 5px 4px; text-align: center; color: #000;">-</td>
                    <td style="border: 1px solid #000; padding: 5px 6px; text-transform: uppercase; color: #000;">TỔNG CỘNG</td>
                    <td style="border: 1px solid #000; padding: 5px 4px; text-align: right; color: #000;">${formatMoneyNoSuffix(aggM.target)}</td>
                    <td style="border: 1px solid #000; padding: 5px 4px; text-align: right; color: #000;">${formatMoneyNoSuffix(aggM.ytd)}</td>
                    <td style="border: 1px solid #000; padding: 5px 4px; text-align: right; color: #000;">${formatMoneyNoSuffix(aggM.today)}</td>
                    <td style="border: 1px solid #000; padding: 5px 4px; text-align: center; color: #000;">${formatPercent(aggRate)}</td>
                    <td style="border: 1px solid #000; padding: 5px 4px; text-align: center; color: #000;">${aggGrowth >= 0 ? '+' : ''}${formatPercent(aggGrowth)}</td>
                    <td style="border: 1px solid #000; padding: 5px 4px; text-align: right; color: #000;">${formatMoneyNoSuffix(aggRemaining)}</td>
                  </tr>
                `;
                return rows;
              })()}
            </tbody>
          </table>
        </div>

        <!-- Khối ký tên và đóng dấu -->
        <table style="width: 100%; border: none !important; margin-top: 30px; border-collapse: collapse; page-break-inside: avoid; color: #000;">
          <tr style="border: none !important;">
            <td style="width: 50%; text-align: center; border: none !important; font-size: 10.5pt; vertical-align: top; padding: 0; color: #000;">
              <strong style="text-transform: uppercase;">Người lập biểu</strong><br>
              <span style="font-style: italic; font-size: 9pt;">(Ký, ghi rõ họ tên)</span>
              <div style="height: 60px;"></div>
              
            </td>
            <td style="width: 50%; text-align: center; border: none !important; font-size: 10.5pt; vertical-align: top; padding: 0; color: #000;">
              <strong style="text-transform: uppercase;">Trưởng thuế cơ sở</strong><br>
              <span style="font-style: italic; font-size: 9pt;">(Ký tên, đóng dấu)</span>
              <div style="height: 60px;"></div>
              <strong style="text-transform: uppercase;">Nguyễn Văn Huấn</strong>
            </td>
          </tr>
        </table>
      </div>
    `;
  }


  function formatDate(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `Ngày ${parts[2]} tháng ${parts[1]} năm ${parts[0]}`;
    }
    return dateStr;
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
    toast.style.background = "var(--color-success)";
    toast.style.color = "#fff";
    toast.style.padding = "10px 20px";
    toast.style.borderRadius = "30px";
    toast.style.fontWeight = "bold";
    toast.style.zIndex = "2000";
    toast.style.boxShadow = "var(--shadow-lg)";
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";
    
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => { toast.style.opacity = "1"; }, 100);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => { toast.remove(); }, 300);
    }, 3000);
  }

  // -------------------------------------------------------------------------
  // 9. CẬP NHẬT SỐ LIỆU ĐỊNH KỲ (Qua File mẫu Excel – 4 loại riêng biệt)
  // -------------------------------------------------------------------------
  const btnPeriodic = document.getElementById("btn-periodic");
  const periodicPanel = document.getElementById("periodic-panel");
  const periodicClose = document.getElementById("periodic-close");

  // Các nút xuất mẫu (4 loại)
  const btnExportTargetProvince = document.getElementById("btn-export-target-province");
  const btnExportTargetBase    = document.getElementById("btn-export-target-base");
  const btnExportActualProvince = document.getElementById("btn-export-actual-province");
  const btnExportActualBase    = document.getElementById("btn-export-actual-base");

  // Input file ẩn (4 loại)
  const fileImportTargetProvince  = document.getElementById("file-import-target-province");
  const fileImportTargetBase      = document.getElementById("file-import-target-base");
  const fileImportActualProvince  = document.getElementById("file-import-actual-province");
  const fileImportActualBase      = document.getElementById("file-import-actual-base");

  // Nút kích hoạt chọn file (4 loại)
  const btnTriggerImportTargetProvince  = document.getElementById("btn-trigger-import-target-province");
  const btnTriggerImportTargetBase      = document.getElementById("btn-trigger-import-target-base");
  const btnTriggerImportActualProvince  = document.getElementById("btn-trigger-import-actual-province");
  const btnTriggerImportActualBase      = document.getElementById("btn-trigger-import-actual-base");

  const btnGuide   = document.getElementById("btn-guide");
  const guideModal = document.getElementById("guide-modal");
  const guideClose = document.getElementById("guide-close");
  const btnGuideOk = document.getElementById("btn-guide-ok");

  // Hướng dẫn sử dụng
  if (btnGuide) {
    btnGuide.addEventListener("click", () => {
      if (guideModal) guideModal.classList.add("open");
      if (overlay) overlay.classList.add("show");
    });
  }

  function closeGuideModal() {
    if (guideModal) guideModal.classList.remove("open");
    if (overlay) overlay.classList.remove("show");
  }

  if (guideClose) guideClose.addEventListener("click", closeGuideModal);
  if (btnGuideOk) btnGuideOk.addEventListener("click", closeGuideModal);

  // Đóng panel hoặc modal khi click overlay
  if (overlay) {
    overlay.addEventListener("click", () => {
      if (periodicPanel && periodicPanel.classList.contains("open")) {
        closePeriodicPanel();
      }
      if (typeof closeGuideModal === 'function' && guideModal && guideModal.classList.contains("open")) {
        closeGuideModal();
      }
    });
  }

  // Đóng/Mở Panel Định kỳ
  if (btnPeriodic) {
    btnPeriodic.addEventListener("click", () => {
      if (periodicPanel) {
        periodicPanel.classList.add("open");
      }
      if (overlay) {
        overlay.classList.add("show");
      }
    });
  }

  if (periodicClose) {
    periodicClose.addEventListener("click", closePeriodicPanel);
  }

  function closePeriodicPanel() {
    if (periodicPanel) {
      periodicPanel.classList.remove("open");
    }
    if (overlay) {
      overlay.classList.remove("show");
    }
  }

  // Lưu bản ghi lịch sử (Snapshot)
  function saveSnapshot(title, cycle) {
    const history = JSON.parse(localStorage.getItem("thue_co_so_13_history") || "[]");
    const now = new Date();
    const timestamp = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')} ngày ${now.getDate()}/${now.getMonth() + 1}`;
    
    const record = {
      id: "snap_" + Date.now(),
      title: title,
      cycle: cycle,
      timestamp: timestamp,
      data: JSON.parse(JSON.stringify(currentData)) // Clone deep
    };
    
    // Giới hạn lịch sử tối đa 15 bản ghi
    history.unshift(record);
    if (history.length > 15) {
      history.pop();
    }
    
    localStorage.setItem("thue_co_so_13_history", JSON.stringify(history));
  }

  // Hàm làm sạch tên xã để so sánh linh hoạt
  function cleanName(str) {
    if (!str) return "";
    return String(str)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove diacritics
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") // remove non-alphanumeric chars
      .replace("xa", "") // remove "xa" (xã)
      .replace("phuong", ""); // remove "phuong" (phường)
  }

  // Helper function to get clean numeric value from AOA sheet
  function parseTriệuĐồng(rawVal) {
    if (rawVal === undefined || rawVal === null || rawVal === "-" || String(rawVal).trim() === "") return 0.0;
    let s = String(rawVal).trim();
    
    // Phát hiện và giữ lại phần thập phân nếu có đúng 1 hoặc 2 chữ số ở cuối
    let match = s.match(/[,.](\d{1,2})$/); 
    if (match) {
        let decimalPart = match[1];
        let integerPart = s.substring(0, s.length - match[0].length);
        integerPart = integerPart.replace(/[,.]/g, ""); // Xóa hết phân cách hàng nghìn
        return parseFloat(integerPart + "." + decimalPart);
    } else {
        // Không có thập phân (hoặc có 3 chữ số như .386 thì coi là hàng nghìn)
        s = s.replace(/[,.]/g, "");
        let num = parseFloat(s);
        return isNaN(num) ? 0.0 : num;
    }
  }

  function getNumValue(sheetAOA, r, c) {
    const row = sheetAOA[r - 1];
    if (!row) return 0.0;
    return parseTriệuĐồng(row[c - 1]);
  }

  // Helper to split combined target
  function getSplitTarget(totalT, ytdBase, ytdProv, defaultBaseFraction) {
    const yBase = Math.max(0.0, ytdBase);
    const yProv = Math.max(0.0, ytdProv);
    const sumYtd = yBase + yProv;
    if (sumYtd > 0) {
      return [totalT * (yBase / sumYtd), totalT * (yProv / sumYtd)];
    } else {
      return [totalT * defaultBaseFraction, totalT * (1.0 - defaultBaseFraction)];
    }
  }

  // Stable mock generators
  function getLastYearYtd(ytd, seedVal) {
    const mult = 0.88 + 0.06 * (seedVal % 5) / 5.0;
    return Math.round(ytd * mult);
  }

  // Recalculate totals and today/last year metrics
  function updateCommuneDerivedFields(commune, r = 10, oldCommune = null) {
    // Look up baseline commune
    const origCommune = originalBaseline.communes.find(oc => oc.id === commune.id) || commune;

    // ----- DYNAMIC START OF MONTH LOOKUP -----
    let startOfMonthData = null;
    try {
      const reportDate = currentData.metadata.reportDate; // "YYYY-MM-DD"
      if (reportDate) {
        const startOfMonthDate = reportDate.substring(0, 8) + '01';
        
        // Luôn đọc lịch sử mới nhất (bỏ cache để không bị dính dữ liệu cũ khi vừa cập nhật ngày mùng 1)
        const history = JSON.parse(localStorage.getItem("thue_co_so_13_history") || "[]");
        const match = history.find(item => item.data && item.data.metadata && item.data.metadata.reportDate === startOfMonthDate);
        
        if (match && match.data) {
          startOfMonthData = match.data.communes.find(c => c.id === commune.id);
        }
      }
    } catch (e) { console.warn("Error looking up start of month data", e); }

    const getStartOfMonthYtd = (taxType, key, item) => {
      if (startOfMonthData && startOfMonthData[taxType] && startOfMonthData[taxType].details && startOfMonthData[taxType].details[key]) {
        return startOfMonthData[taxType].details[key].ytd || 0;
      }
      return item?.periodStartYtd || 0;
    };
    // -----------------------------------------

    // Update provinceTax totals (target is calculated from details)
    commune.provinceTax.target = Object.values(commune.provinceTax.details).reduce((sum, item) => sum + (item?.target || 0), 0);
    commune.provinceTax.ytd = Object.values(commune.provinceTax.details).reduce((sum, item) => sum + (item?.ytd || 0), 0);
    
    // Update baseTax totals (target is calculated from details)
    commune.baseTax.target = Object.values(commune.baseTax.details).reduce((sum, item) => sum + (item?.target || 0), 0);
    commune.baseTax.ytd = Object.values(commune.baseTax.details).reduce((sum, item) => sum + (item?.ytd || 0), 0);

    // Generate lastYearYtd for provinceTax details
    Object.keys(commune.provinceTax.details).forEach((key, index) => {
      const detail = commune.provinceTax.details[key];
      if (detail) detail.lastYearYtd = getLastYearYtd(detail.ytd, r + index + 1);
    });
    commune.provinceTax.lastYearYtd = Object.values(commune.provinceTax.details).reduce((sum, item) => sum + (item?.lastYearYtd || 0), 0);
    
    // Compute provinceTax today (period collection delta)
    commune.provinceTax.today = Object.keys(commune.provinceTax.details).reduce((sum, key) => {
      const item = commune.provinceTax.details[key];
      return sum + ((item?.ytd || 0) - getStartOfMonthYtd("provinceTax", key, item));
    }, 0);

    // Generate lastYearYtd for baseTax details
    Object.keys(commune.baseTax.details).forEach((key, index) => {
      const detail = commune.baseTax.details[key];
      if (detail) detail.lastYearYtd = getLastYearYtd(detail.ytd, r + index + 6);
    });
    commune.baseTax.lastYearYtd = Object.values(commune.baseTax.details).reduce((sum, item) => sum + (item?.lastYearYtd || 0), 0);
    
    // Compute baseTax today (period collection delta)
    commune.baseTax.today = Object.keys(commune.baseTax.details).reduce((sum, key) => {
      const item = commune.baseTax.details[key];
      return sum + ((item?.ytd || 0) - getStartOfMonthYtd("baseTax", key, item));
    }, 0);
    
    // Ensure today values are not negative
    commune.provinceTax.today = Math.max(0, commune.provinceTax.today);
    commune.baseTax.today = Math.max(0, commune.baseTax.today);
  }

  // Danh sách 12 sắc thuế chính (theo thứ tự chuẩn)
  const exportKeys = [
    "land",
    "enterpriseStateCentral",
    "enterpriseStateLocal",
    "enterpriseForeign",
    "enterpriseNonState",
    "pit",
    "registration",
    "landNonAgri",
    "landRent",
    "minerals",
    "otherBudget",
    "others"
  ];

  // Tên hiển thị cho từng sắc thuế
  const keyNames = {
    land: "Tiền sử dụng đất",
    enterpriseStateCentral: "DNNN Trung ương",
    enterpriseStateLocal: "DNNN Địa phương",
    enterpriseForeign: "DN có vốn ĐTNN",
    enterpriseNonState: "Ngoài quốc doanh",
    pit: "Thuế TNCN",
    registration: "Lệ phí trước bạ",
    landNonAgri: "Thuế SDĐ phi NN",
    landRent: "Thu tiền cho thuê đất",
    minerals: "Thu CQ KTKS",
    otherBudget: "Thu khác ngân sách",
    others: "Phí, lệ phí & Thu khác"
  };

  // ============================================================
  // HÀM XUẤT EXCEL – 4 loại mẫu riêng biệt
  // Tham số: taxKey = "province" | "base", dataKey = "target" | "ytd"
  // ============================================================
  function exportFlatExcel(taxKey, dataKey) {
    try {
      const taxLabel = taxKey === "province" ? "Thuế Tỉnh" : "Thuế Cơ Sở";
      const dataLabel = dataKey === "target" ? "Dự toán" : "Thực hiện lũy kế";
      const taxField  = taxKey === "province" ? "provinceTax" : "baseTax";

      // Hàng tiêu đề
      const header1 = ["STT", "Tên Xã / Phường"];
      const header2 = ["",   ""];
      exportKeys.forEach(key => {
        header1.push(keyNames[key]);
        header2.push("(Triệu đ)");
      });

      const rows = [header1, header2];

      currentData.communes.forEach((c, idx) => {
        const rowData = [idx + 1, c.name];
        exportKeys.forEach(key => {
          const val = (c[taxField].details[key]?.[dataKey] || 0) / 1000000;
          rowData.push(Math.round(val * 1000) / 1000); // Làm tròn 3 chữ số thập phân
        });
        rows.push(rowData);
      });

      // Hàng tổng cộng
      const totalRow = ["Σ", "TỔNG CỘNG"];
      exportKeys.forEach(key => {
        const total = currentData.communes.reduce((sum, c) => {
          return sum + (c[taxField].details[key]?.[dataKey] || 0);
        }, 0) / 1000000;
        totalRow.push(Math.round(total * 1000) / 1000);
      });
      rows.push(totalRow);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      const sheetName = `${taxLabel} - ${dataLabel}`.substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      // Độ rộng cột
      ws['!cols'] = [
        { wch: 5 },   // STT
        { wch: 22 },  // Tên xã
        ...exportKeys.map(() => ({ wch: 20 })) // Các cột sắc thuế
      ];

      // Metadata sheet để nhận dạng khi import
      const metaWs = XLSX.utils.aoa_to_sheet([
        ["taxKey",  taxKey],
        ["dataKey", dataKey],
        ["date",    reportDatePickerEl.value]
      ]);
      XLSX.utils.book_append_sheet(wb, metaWs, "_meta");

      const date = reportDatePickerEl.value;
      const prefix = dataKey === "target" ? "dutoan" : "thuchien";
      const suffix = taxKey === "province" ? "thue_tinh" : "thue_co_so";
      XLSX.writeFile(wb, `${prefix}_${suffix}_${date}.xlsx`);
      showToast(`Đã tải mẫu: ${dataLabel} – ${taxLabel}!`);
    } catch (err) {
      alert("Lỗi khi xuất file Excel: " + err.message);
    }
  }

  // Đăng ký 4 nút xuất mẫu
  if (btnExportTargetProvince)  btnExportTargetProvince.addEventListener("click",  () => exportFlatExcel("province", "target"));
  if (btnExportTargetBase)      btnExportTargetBase.addEventListener("click",      () => exportFlatExcel("base",     "target"));
  if (btnExportActualProvince)  btnExportActualProvince.addEventListener("click",  () => exportFlatExcel("province", "ytd"));
  if (btnExportActualBase)      btnExportActualBase.addEventListener("click",      () => exportFlatExcel("base",     "ytd"));

  // ============================================================
  // HÀM NHẬP EXCEL – 4 loại mẫu riêng biệt (Flat Sheet)
  // Tham số: taxKey = "province" | "base", dataKey = "target" | "ytd"
  // ============================================================
  function importFlatExcel(file, taxKey, dataKey) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Phát hiện cấu trúc: nếu có nhiều sheet (file chính thức), dùng handler chính thức
        const sheetNames = workbook.SheetNames.map(n => cleanName(n));
        const hasTinhThu  = sheetNames.some(n => n.includes("tinhthu"));
        const hasXaThu    = sheetNames.some(n => n.includes("xathu"));
        const hasDuToan   = sheetNames.some(n => n.includes("dutoan"));

        if (hasTinhThu && hasXaThu) {
          // File chính thức của cơ quan thuế – dùng handler cũ
          importOfficialWorkbook(workbook, taxKey, dataKey);
          return;
        }

        // File mẫu phẳng do hệ thống tạo ra
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Bỏ qua 2 dòng đầu (header1 + header2)
        if (sheetData.length < 3) {
          alert("File Excel trống hoặc không đúng định dạng!");
          return;
        }

        const taxField = taxKey === "province" ? "provinceTax" : "baseTax";
        const oldData  = JSON.parse(JSON.stringify(currentData));
        let updateCount = 0;

        for (let i = 2; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (!row || row.length < 3) continue;

          // Cột 0 = STT, Cột 1 = Tên xã, Cột 2..13 = 12 sắc thuế
          const rawName = row[1];
          if (!rawName || String(rawName).trim().toUpperCase().includes("TỔNG CỘNG")) continue;

          const nameClean = cleanName(String(rawName).trim());
          const commune = currentData.communes.find(c => {
            const cn = cleanName(c.name);
            return cn.includes(nameClean) || nameClean.includes(cn);
          });
          if (!commune) continue;

          const oldCommune  = oldData.communes.find(oc => oc.id === commune.id);
          const origCommune = originalBaseline.communes.find(oc => oc.id === commune.id) || commune;

          exportKeys.forEach((key, ki) => {
            const colIdx = 2 + ki; // Cột 2 = sắc thuế đầu tiên
            const rawVal = row[colIdx];
            const val = parseTriệuĐồng(rawVal) * 1000000;

            if (!commune[taxField].details[key]) {
              commune[taxField].details[key] = { target: 0, ytd: 0, lastYearYtd: 0 };
            }

            if (dataKey === "target") {
              commune[taxField].details[key].target = Math.round(val);
              // Giữ nguyên YTD cũ
              commune[taxField].details[key].ytd = commune[taxField].details[key].ytd || 0;
            } else {
              // ytd
              commune[taxField].details[key].ytd = Math.round(val);
              // Khóa dự toán từ baseline gốc
              commune[taxField].details[key].target = (origCommune[taxField].details[key] && origCommune[taxField].details[key].target) || commune[taxField].details[key].target || 0;
            }
          });

          // Cập nhật tổng các chỉ số dẫn xuất
          updateCommuneDerivedFields(commune, i, oldCommune);
          updateCount++;
        }

        if (updateCount > 0) {
          currentData.metadata.previousReportDate = oldData.metadata.reportDate;
          // Không tự động saveSnapshot. Dữ liệu chỉ lưu tạm trên RAM cho đến khi người dùng bấm Lưu lại.
          onCommuneSelected();
          renderSidebar();
          closePeriodicPanel();
          showToast(`Đã nạp tạm số liệu ${updateCount} xã (${dataKey === "target" ? "Dự toán" : "Thực hiện"} – ${taxKey === "province" ? "Thuế Tỉnh" : "Thuế Cơ Sở"}). Vui lòng kiểm tra và bấm LƯU LẠI!`);
        } else {
          alert("Không tìm thấy xã nào khớp. Vui lòng kiểm tra tên cột 'Tên Xã / Phường'!");
        }
      } catch (err) {
        alert("Lỗi khi phân tích file Excel: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ============================================================
  // HÀM NHẬP FILE CHÍNH THỨC ĐA SHEET (file của cơ quan thuế)
  // ============================================================
  function importOfficialWorkbook(workbook, taxKey, dataKey) {
    try {
      let sheetSummaryIndex  = -1;
      let sheetProvinceIndex = -1;
      let sheetBaseIndex     = -1;
      let sheetTargetIndex   = -1;

      workbook.SheetNames.forEach((name, idx) => {
        const clean = cleanName(name);
        if (clean.includes("tomtat"))      sheetSummaryIndex  = idx;
        else if (clean.includes("tinhthu")) sheetProvinceIndex = idx;
        else if (clean.includes("xathu"))   sheetBaseIndex     = idx;
        else if (clean.includes("dutoan"))  sheetTargetIndex   = idx;
      });

      if (sheetSummaryIndex  === -1 && workbook.SheetNames[0]) sheetSummaryIndex  = 0;
      if (sheetProvinceIndex === -1 && workbook.SheetNames[2]) sheetProvinceIndex = 2;
      if (sheetBaseIndex     === -1 && workbook.SheetNames[3]) sheetBaseIndex     = 3;
      if (sheetTargetIndex   === -1 && workbook.SheetNames[4]) sheetTargetIndex   = 4;

      const summaryAOA = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[sheetSummaryIndex]],  { header: 1 });
      const provinceAOA = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[sheetProvinceIndex]], { header: 1 });
      const baseAOA    = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[sheetBaseIndex]],      { header: 1 });
      const targetAOA  = sheetTargetIndex !== -1 ? XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[sheetTargetIndex]], { header: 1 }) : [];

      // Trích xuất ngày báo cáo từ B4
      let reportDate = currentData.metadata.reportDate;
      const cellB4 = summaryAOA[3] ? summaryAOA[3][1] : "";
      if (cellB4) {
        const match = String(cellB4).match(/(\d+)\/(\d+)\/(\d+)/);
        if (match) {
          const day = match[1].padStart(2, '0');
          const month = match[2].padStart(2, '0');
          const year  = match[3];
          reportDate = `${year}-${month}-${day}`;
        }
      }

      const oldData = JSON.parse(JSON.stringify(currentData));
      let updateCount = 0;

      currentData.communes.forEach(commune => {
        const targetCleanName = cleanName(commune.name);
        const oldCommune  = oldData.communes.find(oc => oc.id === commune.id);
        const origCommune = originalBaseline.communes.find(oc => oc.id === commune.id) || commune;

        // Tìm dòng xã trong summaryAOA
        let matchedRowIndex = -1;
        for (let i = 0; i < summaryAOA.length; i++) {
          const row = summaryAOA[i];
          if (row && row[1]) {
            const cellClean = cleanName(row[1]);
            if (cellClean.includes(targetCleanName) || targetCleanName.includes(cellClean)) {
              matchedRowIndex = i + 1;
              break;
            }
          }
        }

        // Tìm cột xã trong targetAOA
        let matchedColIndex = -1;
        if (targetAOA && targetAOA[0]) {
          const headerRow = targetAOA[0];
          for (let j = 0; j < headerRow.length; j++) {
            const cellClean = cleanName(headerRow[j]);
            if (cellClean && (cellClean.includes(targetCleanName) || targetCleanName.includes(cellClean))) {
              matchedColIndex = j + 1;
              break;
            }
          }
        }

        if (matchedRowIndex !== -1) {
          const fallbackCols = {
            "dak_wil": 60, "nam_dong": 61, "cu_jut": 62, "nam_da": 63,
            "krong_no": 64, "nam_nung": 65, "quang_phu": 66
          };
          const c = matchedColIndex !== -1 ? matchedColIndex : (fallbackCols[commune.id] || 60);
          const r = matchedRowIndex;

          if (dataKey === "target") {
            // Cập nhật DỰ TOÁN từ file chính thức, giữ nguyên YTD cũ
            let rowMap = {
              land: 39, enterpriseStateCentral: 6, enterpriseStateLocal: 12,
              enterpriseForeign: 18, enterpriseNonState: 24, pit: 30,
              landNonAgri: 31, registration: 33, others: 35,
              landRent: 41, otherBudget: 43, minerals: 45
            };

            if (targetAOA && targetAOA.length > 0) {
              targetAOA.forEach((row, idx) => {
                if (row && row[2]) {
                  const text = cleanName(row[2]);
                  if (text.includes("dnnntrunguong"))           rowMap.enterpriseStateCentral = idx + 1;
                  else if (text.includes("dnnndiaphuong"))      rowMap.enterpriseStateLocal   = idx + 1;
                  else if (text.includes("dncovondtnn") || text.includes("dncovondautunuocngoai")) rowMap.enterpriseForeign = idx + 1;
                  else if (text.includes("ngooiquocdoanh") || text.includes("ngoaiquocdoanh")) rowMap.enterpriseNonState = idx + 1;
                  else if (text.includes("thunhap") && !text.includes("doanhnghiep")) rowMap.pit = idx + 1;
                  else if ((text.includes("lephitruocba") || text.includes("truocba")) && !text.includes("nhadat")) rowMap.registration = idx + 1;
                  else if (text.includes("sudungdatphinongnghiep") || text.includes("sudungdatphinn")) rowMap.landNonAgri = idx + 1;
                  else if (text.includes("chothuedat") || text.includes("chothuematdat")) rowMap.landRent = idx + 1;
                  else if (text.includes("tiensudungdat")) rowMap.land = idx + 1;
                  else if (text.includes("capquyenkhaithackhoangsan") || text.includes("ktks")) rowMap.minerals = idx + 1;
                  else if (text.includes("khacngansach") || text.includes("totaichinh") || text.includes("taichinh")) rowMap.otherBudget = idx + 1;
                  else if (text.includes("philephi")) rowMap.others = idx + 1;
                }
              });
            }

            const getSplitT = (total, base, prov, defaultRatio) => {
              const sum = (base || 0) + (prov || 0);
              if (sum <= 0) { return [total * defaultRatio, total * (1 - defaultRatio)]; }
              return [total * ((base || 0) / sum), total * ((prov || 0) / sum)];
            };

            const applyTarget = (key, rowIdx) => {
              if (!commune.provinceTax.details[key]) commune.provinceTax.details[key] = { target: 0, ytd: 0, lastYearYtd: 0 };
              if (!commune.baseTax.details[key]) commune.baseTax.details[key] = { target: 0, ytd: 0, lastYearYtd: 0 };
              
              const combined = getNumValue(targetAOA, rowIdx, c) * 1000000;
              const split = getSplitT(combined, commune.baseTax.details[key]?.ytd || 0, commune.provinceTax.details[key]?.ytd || 0, 0.50);
              if (taxKey === "province") {
                commune.provinceTax.details[key].target = Math.round(split[1]);
                commune.provinceTax.details[key].ytd = commune.provinceTax.details[key].ytd || 0;
              } else {
                commune.baseTax.details[key].target = Math.round(split[0]);
                commune.baseTax.details[key].ytd = commune.baseTax.details[key].ytd || 0;
              }
            };

            exportKeys.forEach(key => applyTarget(key, rowMap[key] || 1));
          } else {
            // Cập nhật THỰC HIỆN từ file chính thức, giữ nguyên dự toán gốc
            const sourceAOA = taxKey === "province" ? provinceAOA : baseAOA;
            const taxField  = taxKey === "province" ? "provinceTax" : "baseTax";

            // Khóa dự toán từ baseline gốc hoặc giữ nguyên số hiện tại nếu baseline bằng 0
            exportKeys.forEach(key => {
              if (!commune[taxField].details[key]) commune[taxField].details[key] = { target: 0, ytd: 0, lastYearYtd: 0 };
              if (!origCommune[taxField].details[key]) origCommune[taxField].details[key] = { target: 0, ytd: 0, lastYearYtd: 0 };
              commune[taxField].details[key].target = origCommune[taxField].details[key].target || commune[taxField].details[key].target || 0;
            });

            commune[taxField].details.land.ytd                = Math.round(getNumValue(sourceAOA, r, 37) * 1000000);
            commune[taxField].details.enterpriseStateCentral.ytd = Math.round((getNumValue(sourceAOA, r, 8)  + getNumValue(sourceAOA, r, 9)  + getNumValue(sourceAOA, r, 10)) * 1000000);
            commune[taxField].details.enterpriseStateLocal.ytd   = Math.round((getNumValue(sourceAOA, r, 11) + getNumValue(sourceAOA, r, 12) + getNumValue(sourceAOA, r, 13) + getNumValue(sourceAOA, r, 14)) * 1000000);
            commune[taxField].details.enterpriseForeign.ytd      = Math.round((getNumValue(sourceAOA, r, 15) + getNumValue(sourceAOA, r, 16) + getNumValue(sourceAOA, r, 17) + getNumValue(sourceAOA, r, 18)) * 1000000);
            commune[taxField].details.enterpriseNonState.ytd     = Math.round((getNumValue(sourceAOA, r, 19) + getNumValue(sourceAOA, r, 20) + getNumValue(sourceAOA, r, 21) + getNumValue(sourceAOA, r, 22)) * 1000000);
            commune[taxField].details.pit.ytd                    = Math.round(getNumValue(sourceAOA, r, 30) * 1000000);
            commune[taxField].details.registration.ytd           = Math.round(getNumValue(sourceAOA, r, 32) * 1000000);
            commune[taxField].details.landNonAgri.ytd            = Math.round(getNumValue(sourceAOA, r, 35) * 1000000);
            commune[taxField].details.landRent.ytd               = Math.round(getNumValue(sourceAOA, r, 36) * 1000000);
            commune[taxField].details.minerals.ytd               = Math.round(getNumValue(sourceAOA, r, 40) * 1000000);
            commune[taxField].details.otherBudget.ytd            = Math.round(getNumValue(sourceAOA, r, 43) * 1000000);

            // Tính phần còn lại cho "others"
            const totalActual  = getNumValue(sourceAOA, r, 3) * 1000000;
            const mappedSum    = ["land","enterpriseStateCentral","enterpriseStateLocal","enterpriseForeign",
                                  "enterpriseNonState","pit","registration","landNonAgri","landRent",
                                  "minerals","otherBudget"].reduce((s, k) => s + (commune[taxField].details[k].ytd || 0), 0);
            commune[taxField].details.others.ytd = Math.max(0, totalActual - mappedSum);
          }

          updateCommuneDerivedFields(commune, r, oldCommune);
          updateCount++;
        }
      });

      if (updateCount > 0) {
        currentData.metadata.previousReportDate = oldData.metadata.reportDate;
        currentData.metadata.reportDate = reportDate;
        reportDatePickerEl.value = reportDate;
        const prdEl2 = document.getElementById("print-report-date");
        if (prdEl2) prdEl2.textContent = formatDate(reportDate);
        updateLastUpdateTime();
        // Không tự động saveSnapshot
        onCommuneSelected();
        renderSidebar();
        closePeriodicPanel();
        showToast(`Đã nạp tạm số liệu Excel cho ${updateCount} xã! Vui lòng kiểm tra và bấm LƯU LẠI.`);
      } else {
        alert("Không tìm thấy xã nào khớp trong file Excel!");
      }
    } catch (err) {
      alert("Lỗi khi phân tích file Excel chính thức: " + err.message);
    }
  }

  // Đăng ký 4 nút NHẬP (kích hoạt input file ẩn)
  if (btnTriggerImportTargetProvince) {
    btnTriggerImportTargetProvince.addEventListener("click", () => {
      const hasProvinceTarget = currentData.communes.reduce((sum, c) => sum + (c.provinceTax.target || 0), 0) > 0;
      if (hasProvinceTarget) {
        const pass = prompt("Dự toán Thuế Tỉnh đã được nhập và khóa. Vui lòng nhập mật khẩu Quản trị để mở khóa:");
        if (pass !== "admin123") {
          if (pass !== null) alert("Mật khẩu không đúng!");
          return;
        }
      }
      if (fileImportTargetProvince) fileImportTargetProvince.click();
    });
  }

  if (btnTriggerImportTargetBase) {
    btnTriggerImportTargetBase.addEventListener("click", () => {
      const hasBaseTarget = currentData.communes.reduce((sum, c) => sum + (c.baseTax.target || 0), 0) > 0;
      if (hasBaseTarget) {
        const pass = prompt("Dự toán Thuế Cơ Sở đã được nhập và khóa. Vui lòng nhập mật khẩu Quản trị để mở khóa:");
        if (pass !== "admin123") {
          if (pass !== null) alert("Mật khẩu không đúng!");
          return;
        }
      }
      if (fileImportTargetBase) fileImportTargetBase.click();
    });
  }

  if (btnTriggerImportActualProvince)  btnTriggerImportActualProvince.addEventListener("click",  () => fileImportActualProvince  && fileImportActualProvince.click());
  if (btnTriggerImportActualBase)      btnTriggerImportActualBase.addEventListener("click",      () => fileImportActualBase      && fileImportActualBase.click());

  // Xử lý file khi người dùng chọn xong (4 input file)
  function bindFileImport(fileInput, taxKey, dataKey) {
    if (!fileInput) return;
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) importFlatExcel(file, taxKey, dataKey);
      fileInput.value = ""; // Reset để có thể chọn lại cùng file
    });
  }

  bindFileImport(fileImportTargetProvince,  "province", "target");
  bindFileImport(fileImportTargetBase,      "base",     "target");
  bindFileImport(fileImportActualProvince,  "province", "ytd");
  bindFileImport(fileImportActualBase,      "base",     "ytd");

  // === CŨ: Giữ lại handler file chính thức (multi-sheet) khi cần nhập file chính thức qua nút Thực hiện ===
  // Đã tích hợp vào importFlatExcel → importOfficialWorkbook phía trên

  // Đăng ký sự kiện click nút hủy lọc bảng
  if (btnClearTableFilter) {
    btnClearTableFilter.addEventListener("click", () => {
      selectedCommuneId = "tong_hop";
      onCommuneSelected();
      renderSidebar();
    });
  }

  window.exportToExcel = exportToExcel;
  window.importExcel = importExcel;

  // Khóa sổ báo cáo (Chốt kỳ)
  window.finalizeReportingPeriod = function() {
    if (!currentData || !currentData.communes) {
      alert("Lỗi: Không tìm thấy dữ liệu.");
      return;
    }
    
    // Tính tổng số thu trong kỳ hiện tại
    let totalToday = 0;
    currentData.communes.forEach(c => {
      totalToday += (c.provinceTax.today || 0) + (c.baseTax.today || 0);
    });
    
    // Tính ngày tiếp theo
    const currDateStr = currentData.metadata.reportDate;
    let nextDateStr = currDateStr;
    let nextDateDisplay = currDateStr;
    if (currDateStr) {
      const d = new Date(currDateStr);
      d.setDate(d.getDate() + 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dNum = String(d.getDate()).padStart(2, '0');
      nextDateStr = `${y}-${m}-${dNum}`;
      nextDateDisplay = `${dNum}/${m}/${y}`;
    }

    const confirmMsg = `NỘI DUNG KHÓA SỔ:\n\n` +
                       `- Tổng số thu trong kỳ (từ đầu tháng đến hiện tại): ${formatMoney(totalToday)} VNĐ\n` +
                       `- Ngày báo cáo hiện tại: ${formatShortDate(currDateStr)}\n\n` +
                       `Hệ thống sẽ khóa sổ số liệu này, chuyển "Số thu trong kỳ" về 0 và tự động chuyển sang ngày tiếp theo (${nextDateDisplay}).\n\nBạn có chắc chắn muốn thực hiện?`;
                       
    const confirmLock = confirm(confirmMsg);
    if (!confirmLock) return;
    
    // Lưu lại cấu hình ngày
    currentData.metadata.previousReportDate = currDateStr;
    currentData.metadata.reportDate = nextDateStr;
    
    currentData.communes.forEach(c => {
      Object.keys(c.provinceTax.details).forEach(key => {
        c.provinceTax.details[key].periodStartYtd = c.provinceTax.details[key].ytd || 0;
      });
      Object.keys(c.baseTax.details).forEach(key => {
        c.baseTax.details[key].periodStartYtd = c.baseTax.details[key].ytd || 0;
      });
      updateCommuneDerivedFields(c, 10, null);
    });
    
    // Cập nhật giá trị hiển thị trên UI ngày báo cáo
    const reportDatePickerEl = document.getElementById("report-date-picker");
    if (reportDatePickerEl) {
      reportDatePickerEl.value = nextDateStr;
    }
    
    saveSnapshot("Chốt kỳ báo cáo", "Manual");
    onCommuneSelected();
    renderSidebar();
    showToast(`Đã chốt sổ: ${formatMoney(totalToday)} VNĐ. Chuyển sang ngày ${nextDateDisplay}. Vui lòng bấm 'Lưu lại' để lưu vĩnh viễn.`);
  };

  // Khởi chạy ban đầu
  onCommuneSelected();
  renderSidebar();
  renderQuickFilters();

  // Điều chỉnh giao diện trên điện thoại
  function adjustMobileLayout() {
    const appContainer = document.querySelector('.app-container');
    const quickFilters = document.getElementById('quick-commune-filters');
    const modeSelectorContainer = document.querySelector('.view-mode-container');
    const contentHeader = document.querySelector('.content-header');
    const headerFlexRow = document.querySelector('.header-flex-row');
    const header = document.querySelector('header');

    if (window.innerWidth <= 768) {
      if (quickFilters && quickFilters.parentNode !== header) {
        header.appendChild(quickFilters);
      }
      if (modeSelectorContainer && modeSelectorContainer.parentNode !== header) {
        header.appendChild(modeSelectorContainer);
      }
      
      const updateHeaderHeight = () => {
        if (header) {
          const height = header.offsetHeight;
          document.documentElement.style.setProperty('--mobile-header-height', height + 'px');
        }
      };
      
      updateHeaderHeight();
      requestAnimationFrame(updateHeaderHeight);
      setTimeout(updateHeaderHeight, 50);
      setTimeout(updateHeaderHeight, 150);
      setTimeout(updateHeaderHeight, 350);
      setTimeout(updateHeaderHeight, 600);
    } else {
      document.documentElement.style.removeProperty('--mobile-header-height');

      if (quickFilters && contentHeader && quickFilters.parentNode !== contentHeader) {
        contentHeader.insertBefore(quickFilters, contentHeader.firstChild);
      }
      if (modeSelectorContainer && headerFlexRow && modeSelectorContainer.parentNode !== headerFlexRow) {
        headerFlexRow.appendChild(modeSelectorContainer);
      }
    }
  }

  adjustMobileLayout();
  window.addEventListener('resize', adjustMobileLayout);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
