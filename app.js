// -------------------------------------------------------------------------
// Logic điều khiển giao diện thu ngân sách - Thuế cơ sở 13
// Sử dụng Chart.js để vẽ biểu đồ và quản lý tương tác dữ liệu
// -------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  // Trạng thái ứng dụng
  // Trạng thái ứng dụng (Ưu tiên khôi phục từ localStorage để lưu trữ bền vững)
  let currentData;
  const savedState = localStorage.getItem("thue_co_so_13_current_state");
  if (savedState) {
    try {
      currentData = JSON.parse(savedState);
      // Nếu ngày báo cáo trong file data.js khác với ngày trong localStorage,
      // nghĩa là có cập nhật dữ liệu mới từ Excel, ta sẽ ghi đè lại localStorage.
      if (window.BUDGET_DATA && window.BUDGET_DATA.metadata && currentData.metadata && 
          window.BUDGET_DATA.metadata.reportDate !== currentData.metadata.reportDate) {
        currentData = JSON.parse(JSON.stringify(window.BUDGET_DATA));
        localStorage.setItem("thue_co_so_13_current_state", JSON.stringify(currentData));
      }
    } catch (e) {
      currentData = JSON.parse(JSON.stringify(window.BUDGET_DATA));
    }
  } else {
    currentData = JSON.parse(JSON.stringify(window.BUDGET_DATA));
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
      showToast(`Đã khôi phục số liệu ngày: ${formatDate(newDate)} từ lịch sử`);
    } else if (window.BUDGET_DATA && window.BUDGET_DATA.metadata && window.BUDGET_DATA.metadata.reportDate === newDate) {
      currentData = JSON.parse(JSON.stringify(window.BUDGET_DATA));
      showToast(`Đã khôi phục số liệu ngày: ${formatDate(newDate)} từ tệp gốc`);
    } else {
      currentData.metadata.reportDate = newDate;
      showToast(`Đã chuyển ngày báo cáo sang: ${formatDate(newDate)} (Chưa có số liệu cho ngày này)`);
    }
    
    const prdEl = document.getElementById("print-report-date");
    if (prdEl) prdEl.textContent = formatDate(newDate);
    updateLastUpdateTime();
    onCommuneSelected(); // Cập nhật lại giao diện
    renderSidebar(); // Vẽ lại sidebar
  });

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
        details: {
          land: { target: 0, ytd: 0, lastYearYtd: 0 },
          business: { target: 0, ytd: 0, lastYearYtd: 0 },
          pit: { target: 0, ytd: 0, lastYearYtd: 0 },
          registration: { target: 0, ytd: 0, lastYearYtd: 0 },
          others: { target: 0, ytd: 0, lastYearYtd: 0 }
        }
      },
      baseTax: {
        target: 0, today: 0, ytd: 0, lastYearYtd: 0,
        details: {
          land: { target: 0, ytd: 0, lastYearYtd: 0 },
          business: { target: 0, ytd: 0, lastYearYtd: 0 },
          pit: { target: 0, ytd: 0, lastYearYtd: 0 },
          registration: { target: 0, ytd: 0, lastYearYtd: 0 },
          others: { target: 0, ytd: 0, lastYearYtd: 0 }
        }
      }
    };

    currentData.communes.forEach(c => {
      // Cộng dồn Thuế tỉnh
      agg.provinceTax.target += c.provinceTax.target;
      agg.provinceTax.today += c.provinceTax.today;
      agg.provinceTax.ytd += c.provinceTax.ytd;
      agg.provinceTax.lastYearYtd += c.provinceTax.lastYearYtd;
      Object.keys(agg.provinceTax.details).forEach(key => {
        agg.provinceTax.details[key].target += c.provinceTax.details[key].target;
        agg.provinceTax.details[key].ytd += c.provinceTax.details[key].ytd;
        agg.provinceTax.details[key].lastYearYtd += c.provinceTax.details[key].lastYearYtd;
      });

      // Cộng dồn Thuế cơ sở
      agg.baseTax.target += c.baseTax.target;
      agg.baseTax.today += c.baseTax.today;
      agg.baseTax.ytd += c.baseTax.ytd;
      agg.baseTax.lastYearYtd += c.baseTax.lastYearYtd;
      Object.keys(agg.baseTax.details).forEach(key => {
        agg.baseTax.details[key].target += c.baseTax.details[key].target;
        agg.baseTax.details[key].ytd += c.baseTax.details[key].ytd;
        agg.baseTax.details[key].lastYearYtd += c.baseTax.details[key].lastYearYtd;
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
    kpiRateValEl.textContent = rate.toFixed(1) + "%";
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
      kpiTodayTrendEl.textContent = `Đóng góp +${targetPercent.toFixed(2)}% chỉ tiêu`;
    } else {
      kpiTodayTrendEl.className = "percentage-badge down";
      kpiTodayTrendEl.textContent = "Không phát sinh tăng";
    }

    const periodEl = document.getElementById("kpi-today-period");
    if (periodEl) {
      const prevDate = currentData.metadata.previousReportDate;
      const currDate = currentData.metadata.reportDate;
      if (prevDate && prevDate !== currDate) {
        const days = getDaysDiff(prevDate, currDate);
        periodEl.textContent = `Kỳ: ${formatShortDate(prevDate)} - ${formatShortDate(currDate)} (${days} ngày)`;
      } else {
        periodEl.textContent = `Lũy kế đến ngày ${formatShortDate(currDate)}`;
      }
    }

    // 5. Cùng kỳ năm trước
    kpiLastYearValEl.textContent = formatMoney(active.lastYearYtd);
    
    // 6. So sánh cùng kỳ
    const growth = active.lastYearYtd > 0 ? ((active.ytd - active.lastYearYtd) / active.lastYearYtd) * 100 : 0;
    if (kpiComparisonValEl) {
      kpiComparisonValEl.textContent = (growth >= 0 ? "+" : "") + growth.toFixed(1) + "%";
      
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
      kpiGrowthEl.innerHTML = `▲ +${growth.toFixed(1)}% so với cùng kỳ`;
    } else {
      kpiGrowthEl.className = "percentage-badge down";
      kpiGrowthEl.innerHTML = `▼ ${growth.toFixed(1)}% so với cùng kỳ`;
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
      <span class="badge ${getRateBadgeClass(aggRate)}">${aggRate.toFixed(1)}%</span>
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
        <span class="badge ${getRateBadgeClass(rate)}">${rate.toFixed(1)}%</span>
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
    list.forEach(c => {
      const tr = document.createElement("tr");
      tr.className = selectedCommuneId === c.id ? "active-row" : "";
      if (selectedCommuneId === c.id) {
        tr.style.backgroundColor = "var(--color-primary-light)";
      }
      
      const land = getTaxCatValues(c, "land");
      const business = getTaxCatValues(c, "business");
      const pit = getTaxCatValues(c, "pit");
      const registration = getTaxCatValues(c, "registration");
      const others = getTaxCatValues(c, "others");
      
      const metrics = getCommuneMetrics(c, currentViewMode);
      
      tr.innerHTML = `
        <td class="text-left" style="font-weight: 700; cursor: pointer;">${c.name}</td>
        <td class="text-right" style="font-weight: bold; color: var(--color-primary);">${formatMoney(metrics.target)}</td>
        <td class="text-right" style="font-weight: bold; color: var(--color-success);">${formatMoney(metrics.ytd)}</td>
        <td class="text-right">${formatMoney(business.target)}</td>
        <td class="text-right">${formatMoney(business.ytd)}</td>
        <td class="text-right">${formatMoney(pit.target)}</td>
        <td class="text-right">${formatMoney(pit.ytd)}</td>
        <td class="text-right">${formatMoney(registration.target)}</td>
        <td class="text-right">${formatMoney(registration.ytd)}</td>
        <td class="text-right">${formatMoney(others.target)}</td>
        <td class="text-right">${formatMoney(others.ytd)}</td>
        <td class="text-right">${formatMoney(land.target)}</td>
        <td class="text-right">${formatMoney(land.ytd)}</td>
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
      const business = getTaxCatValues(agg, "business");
      const pit = getTaxCatValues(agg, "pit");
      const registration = getTaxCatValues(agg, "registration");
      const others = getTaxCatValues(agg, "others");
      const metrics = getCommuneMetrics(agg, currentViewMode);
      
      const trTotal = document.createElement("tr");
      trTotal.style.fontWeight = "bold";
      trTotal.style.background = "var(--bg-primary)";
      trTotal.style.borderTop = "2px solid var(--border-color)";
      
      trTotal.innerHTML = `
        <td class="text-left" style="color: var(--color-primary)">TỔNG CỘNG</td>
        <td class="text-right" style="color: var(--color-primary);">${formatMoney(metrics.target)}</td>
        <td class="text-right" style="color: var(--color-success);">${formatMoney(metrics.ytd)}</td>
        <td class="text-right">${formatMoney(business.target)}</td>
        <td class="text-right">${formatMoney(business.ytd)}</td>
        <td class="text-right">${formatMoney(pit.target)}</td>
        <td class="text-right">${formatMoney(pit.ytd)}</td>
        <td class="text-right">${formatMoney(registration.target)}</td>
        <td class="text-right">${formatMoney(registration.ytd)}</td>
        <td class="text-right">${formatMoney(others.target)}</td>
        <td class="text-right">${formatMoney(others.ytd)}</td>
        <td class="text-right">${formatMoney(land.target)}</td>
        <td class="text-right">${formatMoney(land.ytd)}</td>
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
          <span style="font-weight: 700;">${c.ytdRate.toFixed(1)}%</span>
        </td>
        <td class="text-right">${formatMoney(c.target)}</td>
        <td class="text-right">${formatMoney(c.ytd)}</td>
        <td class="text-right" style="font-weight: bold; color: var(--color-primary);">${formatMoney(c.today)}</td>
        <td class="text-center">
          <span class="percentage-badge ${c.growth >= 0 ? 'up' : 'down'}">
            ${c.growth >= 0 ? '▲ +' : '▼ '}${c.growth.toFixed(1)}%
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
      
      trTotal.innerHTML = `
        <td class="text-left" style="color: var(--color-primary)">TỔNG CỘNG</td>
        <td class="text-center">
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${Math.min(aggRate, 100)}%; background-color: ${aggRate >= 85 ? 'var(--color-success)' : aggRate >= 50 ? 'var(--color-warning)' : 'var(--color-danger)'};"></div>
          </div>
          <span>${aggRate.toFixed(1)}%</span>
        </td>
        <td class="text-right">${formatMoney(aggMetrics.target)}</td>
        <td class="text-right">${formatMoney(aggMetrics.ytd)}</td>
        <td class="text-right" style="color: var(--color-primary)">${formatMoney(aggMetrics.today)}</td>
        <td class="text-center">
          <span class="percentage-badge ${aggGrowth >= 0 ? 'up' : 'down'}">
            ${aggGrowth >= 0 ? '▲ +' : '▼ '}${aggGrowth.toFixed(1)}%
          </span>
        </td>
        <td class="text-right">${formatMoney(aggRemaining)}</td>
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
          <td style="text-align: center; font-weight: bold;">${c.ytdRate.toFixed(1)}%</td>
          <td style="text-align: right;">${formatMoney(c.target)}</td>
          <td style="text-align: right;">${formatMoney(c.ytd)}</td>
          <td style="text-align: right; font-weight: bold;">${formatMoney(c.today)}</td>
          <td style="text-align: center; font-weight: bold;">
            ${c.growth >= 0 ? '+' : ''}${c.growth.toFixed(1)}%
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
        trTotal.innerHTML = `
          <td style="text-align: center;">-</td>
          <td>TỔNG CỘNG</td>
          <td style="text-align: center;">${aggRate.toFixed(1)}%</td>
          <td style="text-align: right;">${formatMoney(aggMetrics.target)}</td>
          <td style="text-align: right;">${formatMoney(aggMetrics.ytd)}</td>
          <td style="text-align: right;">${formatMoney(aggMetrics.today)}</td>
          <td style="text-align: center;">
            ${aggGrowth >= 0 ? '+' : ''}${aggGrowth.toFixed(1)}%
          </td>
          <td style="text-align: right;">${formatMoney(aggRemaining)}</td>
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

  // Nút Khôi phục số liệu gốc
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử và khôi phục số liệu gốc ban đầu không?")) {
        localStorage.removeItem("thue_co_so_13_current_state");
        localStorage.removeItem("thue_co_so_13_history");
        location.reload();
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
            <strong>${idx + 1}. ${c.name}</strong>: Chỉ tiêu dự toán được giao cả năm là ${formatMoneyNoSuffix(cMetrics.target)} triệu đồng; lũy kế thực thu đạt ${formatMoneyNoSuffix(cMetrics.ytd)} triệu đồng, đạt tỷ lệ tiến độ <strong>${cRate.toFixed(1)}%</strong>. So với thực thu cùng kỳ năm trước, tốc độ tăng trưởng đạt <strong>${cGrowth >= 0 ? '+' : ''}${cGrowth.toFixed(1)}%</strong>.
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
          Địa bàn có tiến độ thực hiện đạt tỷ lệ cao nhất toàn khu vực là <strong>${sortedCommunes[0].name}</strong> (hoàn thành đạt tỷ lệ ${sortedCommunes[0].rate.toFixed(1)}% dự toán năm). Đơn vị có tiến độ thu chậm nhất là <strong>${sortedCommunes[sortedCommunes.length - 1].name}</strong> (mới chỉ đạt ${sortedCommunes[sortedCommunes.length - 1].rate.toFixed(1)}% dự toán năm), cần tập trung đôn đốc chỉ đạo sát sao trong thời gian tới.
        </p>
      `;
    } else {
      communeAnalysisHTML += `
        <h4 style="font-size: 11pt; font-weight: bold; margin-top: 15px; margin-bottom: 5px; margin-left: 1.27cm; text-transform: uppercase; color: #000;">
          II. Phân tích chi tiết tình hình thu ngân sách trên địa bàn ${active.name}
        </h4>
        <p style="text-indent: 1.27cm; text-align: justify; margin-bottom: 15px; color: #000; line-height: 1.5;">
          Địa bàn <strong>${active.name}</strong> được giao chỉ tiêu dự toán thu ngân sách cả năm là ${formatMoneyNoSuffix(active.target)} triệu đồng. Đến nay, đơn vị đã thực hiện thu nộp ngân sách lũy kế đạt ${formatMoneyNoSuffix(active.ytd)} triệu đồng, hoàn thành đạt tỷ lệ tiến độ <strong>${totalRate.toFixed(1)}%</strong> dự toán năm. So với cùng kỳ năm ngoái, mức độ thu đạt tỷ lệ tăng trưởng <strong>${totalGrowth >= 0 ? '+' : ''}${totalGrowth.toFixed(1)}%</strong>.
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
      { key: "business", name: "Thuế Công thương nghiệp ngoài quốc doanh" },
      { key: "pit", name: "Thuế Thu nhập cá nhân" },
      { key: "registration", name: "Lệ phí trước bạ" },
      { key: "others", name: "Phí, lệ phí & các khoản thu khác" },
      { key: "land", name: "Tiền sử dụng đất" }
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
          <strong>${idx + 1}. ${cat.name}</strong>: Dự toán cả năm là ${formatMoneyNoSuffix(catTarget)} triệu đồng; lũy kế thực thu đến nay đạt ${formatMoneyNoSuffix(catYtd)} triệu đồng, hoàn thành <strong>${catRate.toFixed(1)}%</strong> chỉ tiêu. So với cùng kỳ năm ngoái, sắc thuế này đạt tốc độ tăng trưởng là <strong>${catGrowth >= 0 ? '+' : ''}${catGrowth.toFixed(1)}%</strong>.
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
          Tổng số thu ngân sách nhà nước lũy kế thực hiện trên địa bàn đạt <strong>${formatMoneyNoSuffix(totalYtd)}</strong> triệu đồng, hoàn thành đạt tỷ lệ <strong>${totalRate.toFixed(1)}%</strong> so với chỉ tiêu dự toán được giao (${formatMoneyNoSuffix(totalTarget)} triệu đồng). So với số liệu thực thu cùng kỳ năm ngoái (lũy kế đạt ${formatMoneyNoSuffix(totalLastYearYtd)} triệu đồng), tiến độ thu ngân sách ghi nhận mức tăng trưởng đạt <strong>${totalGrowth >= 0 ? '+' : ''}${totalGrowth.toFixed(1)}%</strong>. Số phát sinh trong kỳ cập nhật báo cáo đạt ${formatMoneyNoSuffix(active.today)} triệu đồng.
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
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: center; font-weight: bold; color: #000;">${provRate.toFixed(1)}%</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: center; color: #000;">${provGrowth >= 0 ? '+' : ''}${provGrowth.toFixed(1)}%</td>
              </tr>
              <tr>
                <td style="border: 1px solid #000 !important; padding: 6px; font-weight: bold; color: #000;">2. Thuế Cơ Sở (Chi cục trực tiếp quản lý)</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: right; color: #000;">${formatMoneyNoSuffix(baseTarget)}</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: right; color: #000;">${formatMoneyNoSuffix(baseYtd)}</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: center; font-weight: bold; color: #000;">${baseRate.toFixed(1)}%</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: center; color: #000;">${baseGrowth >= 0 ? '+' : ''}${baseGrowth.toFixed(1)}%</td>
              </tr>
              <tr style="font-weight: bold; background: #f2f2f2;">
                <td style="border: 1px solid #000 !important; padding: 6px; text-transform: uppercase; color: #000;">TỔNG CỘNG địa bàn</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: right; color: #000;">${formatMoneyNoSuffix(totalTarget)}</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: right; color: #000;">${formatMoneyNoSuffix(totalYtd)}</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: center; color: #000;">${totalRate.toFixed(1)}%</td>
                <td style="border: 1px solid #000 !important; padding: 6px; text-align: center; color: #000;">${totalGrowth >= 0 ? '+' : ''}${totalGrowth.toFixed(1)}%</td>
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
                      <td style="border: 1px solid #000; padding: 5px 4px; text-align: center; font-weight: bold; color: #000;">${c.rate.toFixed(1)}%</td>
                      <td style="border: 1px solid #000; padding: 5px 4px; text-align: center; color: #000;">${c.growth >= 0 ? '+' : ''}${c.growth.toFixed(1)}%</td>
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
                    <td style="border: 1px solid #000; padding: 5px 4px; text-align: center; color: #000;">${aggRate.toFixed(1)}%</td>
                    <td style="border: 1px solid #000; padding: 5px 4px; text-align: center; color: #000;">${aggGrowth >= 0 ? '+' : ''}${aggGrowth.toFixed(1)}%</td>
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
  // 9. CẬP NHẬT SỐ LIỆU ĐỊNH KỲ (Qua File mẫu Excel)
  // -------------------------------------------------------------------------
  const btnPeriodic = document.getElementById("btn-periodic");
  const periodicPanel = document.getElementById("periodic-panel");
  const periodicClose = document.getElementById("periodic-close");

  const btnExportExcel = document.getElementById("btn-export-excel");
  const fileImportExcel = document.getElementById("file-import-excel");
  const btnTriggerExcelImport = document.getElementById("btn-trigger-excel-import");

  const btnGuide = document.getElementById("btn-guide");
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
  overlay.addEventListener("click", () => {
    if (periodicPanel.classList.contains("open")) {
      closePeriodicPanel();
    }
    if (typeof closeGuideModal === 'function' && guideModal && guideModal.classList.contains("open")) {
      closeGuideModal();
    }
  });

  // Đóng/Mở Panel Định kỳ
  btnPeriodic.addEventListener("click", () => {
    periodicPanel.classList.add("open");
    overlay.classList.add("show");
  });

  periodicClose.addEventListener("click", closePeriodicPanel);

  function closePeriodicPanel() {
    periodicPanel.classList.remove("open");
    overlay.classList.remove("show");
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
  function getNumValue(sheetAOA, r, c) {
    const row = sheetAOA[r - 1];
    if (!row) return 0.0;
    const val = row[c - 1];
    if (val === undefined || val === null) return 0.0;
    if (typeof val === "string") {
      const cleanVal = val.replace(/\s+/g, "").replace(/,/g, "");
      const num = parseFloat(cleanVal);
      return isNaN(num) ? 0.0 : num;
    }
    return typeof val === "number" ? val : 0.0;
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

  // Today's collections generator
  function getTodayVal(ytd, seedVal) {
    if (ytd === 0) return 0;
    const raw = ytd * 0.001 * (1 + (seedVal % 3));
    return Math.round(raw / 100000) * 100000;
  }

  // Recalculate totals and today/last year metrics
  function updateCommuneDerivedFields(commune, r = 10, oldCommune = null) {
    // Update provinceTax totals
    commune.provinceTax.target = Object.values(commune.provinceTax.details).reduce((sum, item) => sum + item.target, 0);
    commune.provinceTax.ytd = Object.values(commune.provinceTax.details).reduce((sum, item) => sum + item.ytd, 0);
    
    // Update baseTax totals
    commune.baseTax.target = Object.values(commune.baseTax.details).reduce((sum, item) => sum + item.target, 0);
    commune.baseTax.ytd = Object.values(commune.baseTax.details).reduce((sum, item) => sum + item.ytd, 0);

    // Generate lastYearYtd for provinceTax details
    Object.keys(commune.provinceTax.details).forEach((key, index) => {
      const detail = commune.provinceTax.details[key];
      detail.lastYearYtd = getLastYearYtd(detail.ytd, r + index + 1);
    });
    commune.provinceTax.lastYearYtd = Object.values(commune.provinceTax.details).reduce((sum, item) => sum + (item.lastYearYtd || 0), 0);
    
    // Compute provinceTax today (period collection delta)
    if (oldCommune && oldCommune.provinceTax) {
      commune.provinceTax.today = Math.max(0, commune.provinceTax.ytd - oldCommune.provinceTax.ytd);
    } else {
      commune.provinceTax.today = Object.keys(commune.provinceTax.details).reduce((sum, key, index) => {
        const detail = commune.provinceTax.details[key];
        return sum + getTodayVal(detail.ytd, r + index + 11);
      }, 0);
    }

    // Generate lastYearYtd for baseTax details
    Object.keys(commune.baseTax.details).forEach((key, index) => {
      const detail = commune.baseTax.details[key];
      detail.lastYearYtd = getLastYearYtd(detail.ytd, r + index + 6);
    });
    commune.baseTax.lastYearYtd = Object.values(commune.baseTax.details).reduce((sum, item) => sum + (item.lastYearYtd || 0), 0);
    
    // Compute baseTax today (period collection delta)
    if (oldCommune && oldCommune.baseTax) {
      commune.baseTax.today = Math.max(0, commune.baseTax.ytd - oldCommune.baseTax.ytd);
    } else {
      commune.baseTax.today = Object.keys(commune.baseTax.details).reduce((sum, key, index) => {
        const detail = commune.baseTax.details[key];
        return sum + getTodayVal(detail.ytd, r + index + 16);
      }, 0);
    }
  }

  // Xuất file mẫu Excel định kỳ (Hỗ trợ 21 cột chi tiết)
  btnExportExcel.addEventListener("click", () => {
    try {
      const headers = [
        "Tên Xã",
        "Thuế Tỉnh - Dự toán - Sử dụng đất (Triệu đ)",
        "Thuế Tỉnh - Lũy kế - Sử dụng đất (Triệu đ)",
        "Thuế Tỉnh - Dự toán - Thuế CTN ngoài quốc doanh (Triệu đ)",
        "Thuế Tỉnh - Lũy kế - Thuế CTN ngoài quốc doanh (Triệu đ)",
        "Thuế Tỉnh - Dự toán - Thuế TNCN (Triệu đ)",
        "Thuế Tỉnh - Lũy kế - Thuế TNCN (Triệu đ)",
        "Thuế Tỉnh - Dự toán - Lệ phí trước bạ (Triệu đ)",
        "Thuế Tỉnh - Lũy kế - Lệ phí trước bạ (Triệu đ)",
        "Thuế Tỉnh - Dự toán - Phí, lệ phí & Thu khác (Triệu đ)",
        "Thuế Tỉnh - Lũy kế - Phí, lệ phí & Thu khác (Triệu đ)",
        "Thuế Cơ Sở - Dự toán - Sử dụng đất (Triệu đ)",
        "Thuế Cơ Sở - Lũy kế - Sử dụng đất (Triệu đ)",
        "Thuế Cơ Sở - Dự toán - Thuế CTN ngoài quốc doanh (Triệu đ)",
        "Thuế Cơ Sở - Lũy kế - Thuế CTN ngoài quốc doanh (Triệu đ)",
        "Thuế Cơ Sở - Dự toán - Thuế TNCN (Triệu đ)",
        "Thuế Cơ Sở - Lũy kế - Thuế TNCN (Triệu đ)",
        "Thuế Cơ Sở - Dự toán - Lệ phí trước bạ (Triệu đ)",
        "Thuế Cơ Sở - Lũy kế - Lệ phí trước bạ (Triệu đ)",
        "Thuế Cơ Sở - Dự toán - Phí, lệ phí & Thu khác (Triệu đ)",
        "Thuế Cơ Sở - Lũy kế - Phí, lệ phí & Thu khác (Triệu đ)"
      ];
      
      const rows = [headers];
      
      currentData.communes.forEach(c => {
        rows.push([
          c.name,
          (c.provinceTax.details.land.target || 0) / 1000000,
          (c.provinceTax.details.land.ytd || 0) / 1000000,
          (c.provinceTax.details.business.target || 0) / 1000000,
          (c.provinceTax.details.business.ytd || 0) / 1000000,
          (c.provinceTax.details.pit.target || 0) / 1000000,
          (c.provinceTax.details.pit.ytd || 0) / 1000000,
          (c.provinceTax.details.registration.target || 0) / 1000000,
          (c.provinceTax.details.registration.ytd || 0) / 1000000,
          (c.provinceTax.details.others.target || 0) / 1000000,
          (c.provinceTax.details.others.ytd || 0) / 1000000,
          (c.baseTax.details.land.target || 0) / 1000000,
          (c.baseTax.details.land.ytd || 0) / 1000000,
          (c.baseTax.details.business.target || 0) / 1000000,
          (c.baseTax.details.business.ytd || 0) / 1000000,
          (c.baseTax.details.pit.target || 0) / 1000000,
          (c.baseTax.details.pit.ytd || 0) / 1000000,
          (c.baseTax.details.registration.target || 0) / 1000000,
          (c.baseTax.details.registration.ytd || 0) / 1000000,
          (c.baseTax.details.others.target || 0) / 1000000,
          (c.baseTax.details.others.ytd || 0) / 1000000
        ]);
      });
      
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Số liệu Thu thuế");
      
      ws['!cols'] = headers.map(h => ({ wch: h.length + 3 }));
      
      const date = reportDatePickerEl.value;
      XLSX.writeFile(wb, `thue_co_so_13_so_lieu_${date}.xlsx`);
      showToast("Đã tải file mẫu Excel thành công!");
    } catch (err) {
      alert("Lỗi khi tạo file Excel: " + err.message);
    }
  });

  // Nhập file Excel định kỳ
  btnTriggerExcelImport.addEventListener("click", () => {
    fileImportExcel.click();
  });

  fileImportExcel.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Sao lưu trạng thái cũ để tính toán số thu chênh lệch trong kỳ
        const oldData = JSON.parse(JSON.stringify(currentData));
        
        // Phát hiện cấu trúc tệp Excel (Chính thức vs Mẫu phẳng)
        let isOfficialWorkbook = false;
        let sheetSummaryIndex = -1;
        let sheetProvinceIndex = -1;
        let sheetBaseIndex = -1;
        let sheetTargetIndex = -1;

        workbook.SheetNames.forEach((name, idx) => {
          const clean = cleanName(name);
          if (clean.includes("tomtat")) {
            sheetSummaryIndex = idx;
          } else if (clean.includes("tinhthu")) {
            sheetProvinceIndex = idx;
          } else if (clean.includes("xathu")) {
            sheetBaseIndex = idx;
          } else if (clean.includes("dutoan")) {
            sheetTargetIndex = idx;
          }
        });

        // Fallback sang vị trí mặc định nếu không tìm thấy bằng tên
        if (sheetSummaryIndex === -1 && workbook.SheetNames[0]) sheetSummaryIndex = 0;
        if (sheetProvinceIndex === -1 && workbook.SheetNames[2]) sheetProvinceIndex = 2;
        if (sheetBaseIndex === -1 && workbook.SheetNames[3]) sheetBaseIndex = 3;
        if (sheetTargetIndex === -1 && workbook.SheetNames[4]) sheetTargetIndex = 4;

        if (sheetProvinceIndex !== -1 && sheetBaseIndex !== -1 && sheetSummaryIndex !== -1) {
          isOfficialWorkbook = true;
        }

        let updateCount = 0;
        let reportDate = currentData.metadata.reportDate;

        if (isOfficialWorkbook) {
          // TRÌNH XỬ LÝ NHẬP FILE CHÍNH THỨC CỦA CƠ QUAN THUẾ (MULTI-SHEET)
          const summaryAOA = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[sheetSummaryIndex]], { header: 1 });
          const provinceAOA = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[sheetProvinceIndex]], { header: 1 });
          const baseAOA = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[sheetBaseIndex]], { header: 1 });
          const targetAOA = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[sheetTargetIndex]], { header: 1 });

          // Trích xuất ngày báo cáo từ ô B4 (dòng 4, cột 2) trong sheet Tóm tắt
          const cellB4 = summaryAOA[3] ? summaryAOA[3][1] : "";
          if (cellB4) {
            const match = String(cellB4).match(/(\d+)\/(\d+)\/(\d+)/);
            if (match) {
              const day = match[1].padStart(2, '0');
              const month = match[2].padStart(2, '0');
              const year = match[3];
              reportDate = `${year}-${month}-${day}`;
            }
          }

          currentData.communes.forEach(commune => {
            const targetCleanName = cleanName(commune.name);
            const oldCommune = oldData.communes.find(oc => oc.id === commune.id);
            
            // Tìm dòng khớp tên xã trong summaryAOA / provinceAOA / baseAOA
            let matchedRowIndex = -1; 
            for (let i = 0; i < summaryAOA.length; i++) {
              const row = summaryAOA[i];
              if (row && row[1]) {
                const cellClean = cleanName(row[1]);
                if (cellClean.includes(targetCleanName) || targetCleanName.includes(cellClean)) {
                  matchedRowIndex = i + 1; // Đổi sang 1-based index
                  break;
                }
              }
            }
            
            // Tìm cột khớp tên xã trong targetAOA (dự toán)
            let matchedColIndex = -1;
            if (targetAOA && targetAOA[0]) {
              const headerRow = targetAOA[0];
              for (let j = 0; j < headerRow.length; j++) {
                const cellClean = cleanName(headerRow[j]);
                if (cellClean && (cellClean.includes(targetCleanName) || targetCleanName.includes(cellClean))) {
                  matchedColIndex = j + 1; // Đổi sang 1-based index
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

              // Thu thập dự toán chỉ tiêu
              const base_total_target = getNumValue(summaryAOA, r, 10) * 1000000;
              const prov_total_target = getNumValue(summaryAOA, r, 15) * 1000000;
              
              const land_combined_target = getNumValue(targetAOA, 38, c) * 1000000;
              const bus_combined_target  = getNumValue(targetAOA, 24, c) * 1000000;
              const pit_combined_target  = getNumValue(targetAOA, 30, c) * 1000000;
              const reg_combined_target  = getNumValue(targetAOA, 33, c) * 1000000;
              
              const land_base_target = getNumValue(summaryAOA, r, 12) * 1000000;
              const land_prov_target = getNumValue(summaryAOA, r, 17) * 1000000;

              // Thu thập thực thu lũy kế
              const prov_total_ytd = getNumValue(provinceAOA, r, 3) * 1000000;
              const prov_land_ytd = getNumValue(provinceAOA, r, 37) * 1000000;
              const prov_bus_ytd = (
                getNumValue(provinceAOA, r, 19) + 
                getNumValue(provinceAOA, r, 20) + 
                getNumValue(provinceAOA, r, 21) + 
                getNumValue(provinceAOA, r, 22)
              ) * 1000000;
              const prov_pit_ytd = getNumValue(provinceAOA, r, 30) * 1000000;
              const prov_reg_ytd = getNumValue(provinceAOA, r, 32) * 1000000;
              let prov_oth_ytd = prov_total_ytd - (prov_land_ytd + prov_bus_ytd + prov_pit_ytd + prov_reg_ytd);
              if (prov_oth_ytd < 0) prov_oth_ytd = 0;

              const base_total_ytd = getNumValue(baseAOA, r, 3) * 1000000;
              const base_land_ytd = getNumValue(baseAOA, r, 37) * 1000000;
              const base_bus_ytd = (
                getNumValue(baseAOA, r, 19) + 
                getNumValue(baseAOA, r, 20) + 
                getNumValue(baseAOA, r, 21) + 
                getNumValue(baseAOA, r, 22)
              ) * 1000000;
              const base_pit_ytd = getNumValue(baseAOA, r, 30) * 1000000;
              const base_reg_ytd = getNumValue(baseAOA, r, 32) * 1000000;
              let base_oth_ytd = base_total_ytd - (base_land_ytd + base_bus_ytd + base_pit_ytd + base_reg_ytd);
              if (base_oth_ytd < 0) base_oth_ytd = 0;

              // Tách dự toán dựa trên phân phối thực thu
              const bus_split = getSplitTarget(bus_combined_target, base_bus_ytd, prov_bus_ytd, 0.70);
              const bus_base_target = bus_split[0];
              const bus_prov_target = bus_split[1];

              const pit_split = getSplitTarget(pit_combined_target, base_pit_ytd, prov_pit_ytd, 0.85);
              const pit_base_target = pit_split[0];
              const pit_prov_target = pit_split[1];

              const reg_split = getSplitTarget(reg_combined_target, base_reg_ytd, prov_reg_ytd, 0.85);
              const reg_base_target = reg_split[0];
              const reg_prov_target = reg_split[1];

              let oth_base_target = base_total_target - (land_base_target + bus_base_target + pit_base_target + reg_base_target);
              if (oth_base_target < 0) oth_base_target = 0;

              let oth_prov_target = prov_total_target - (land_prov_target + bus_prov_target + pit_prov_target + reg_prov_target);
              if (oth_prov_target < 0) oth_prov_target = 0;

              // Áp dụng dữ liệu vào bộ nhớ
              commune.provinceTax.details.land.target = Math.round(land_prov_target);
              commune.provinceTax.details.land.ytd = Math.round(prov_land_ytd);
              commune.provinceTax.details.business.target = Math.round(bus_prov_target);
              commune.provinceTax.details.business.ytd = Math.round(prov_bus_ytd);
              commune.provinceTax.details.pit.target = Math.round(pit_prov_target);
              commune.provinceTax.details.pit.ytd = Math.round(prov_pit_ytd);
              commune.provinceTax.details.registration.target = Math.round(reg_prov_target);
              commune.provinceTax.details.registration.ytd = Math.round(prov_reg_ytd);
              commune.provinceTax.details.others.target = Math.round(oth_prov_target);
              commune.provinceTax.details.others.ytd = Math.round(prov_oth_ytd);

              commune.baseTax.details.land.target = Math.round(land_base_target);
              commune.baseTax.details.land.ytd = Math.round(base_land_ytd);
              commune.baseTax.details.business.target = Math.round(bus_base_target);
              commune.baseTax.details.business.ytd = Math.round(base_bus_ytd);
              commune.baseTax.details.pit.target = Math.round(pit_base_target);
              commune.baseTax.details.pit.ytd = Math.round(base_pit_ytd);
              commune.baseTax.details.registration.target = Math.round(reg_base_target);
              commune.baseTax.details.registration.ytd = Math.round(base_reg_ytd);
              commune.baseTax.details.others.target = Math.round(oth_base_target);
              commune.baseTax.details.others.ytd = Math.round(base_oth_ytd);

              // Cập nhật các chỉ số tổng hợp
              updateCommuneDerivedFields(commune, r, oldCommune);
              updateCount++;
            }
          });
        } else {
          // TRÌNH XỬ LÝ NHẬP FILE MẪU PHẲNG (FLAT SHEET)
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          if (sheetData.length < 2) {
            alert("Mẫu file Excel trống hoặc không đúng định dạng!");
            return;
          }

          for (let i = 1; i < sheetData.length; i++) {
            const row = sheetData[i];
            if (!row || row.length === 0) continue;

            const communeNameRaw = row[0];
            if (!communeNameRaw) continue;

            const communeNameStr = String(communeNameRaw).trim();
            const targetCleanName = cleanName(communeNameStr);

            const commune = currentData.communes.find(c => {
              const cleanC = cleanName(c.name);
              return cleanC.includes(targetCleanName) || targetCleanName.includes(cleanC);
            });

            if (commune) {
              const oldCommune = oldData.communes.find(oc => oc.id === commune.id);
              if (row.length > 11) {
                // Nhập định dạng mẫu mới với 21 cột (bao gồm cả Thuế Tỉnh + Thuế Cơ Sở)
                commune.provinceTax.details.land.target = (parseFloat(row[1]) || 0) * 1000000;
                commune.provinceTax.details.land.ytd = (parseFloat(row[2]) || 0) * 1000000;
                commune.provinceTax.details.business.target = (parseFloat(row[3]) || 0) * 1000000;
                commune.provinceTax.details.business.ytd = (parseFloat(row[4]) || 0) * 1000000;
                commune.provinceTax.details.pit.target = (parseFloat(row[5]) || 0) * 1000000;
                commune.provinceTax.details.pit.ytd = (parseFloat(row[6]) || 0) * 1000000;
                commune.provinceTax.details.registration.target = (parseFloat(row[7]) || 0) * 1000000;
                commune.provinceTax.details.registration.ytd = (parseFloat(row[8]) || 0) * 1000000;
                commune.provinceTax.details.others.target = (parseFloat(row[9]) || 0) * 1000000;
                commune.provinceTax.details.others.ytd = (parseFloat(row[10]) || 0) * 1000000;

                commune.baseTax.details.land.target = (parseFloat(row[11]) || 0) * 1000000;
                commune.baseTax.details.land.ytd = (parseFloat(row[12]) || 0) * 1000000;
                commune.baseTax.details.business.target = (parseFloat(row[13]) || 0) * 1000000;
                commune.baseTax.details.business.ytd = (parseFloat(row[14]) || 0) * 1000000;
                commune.baseTax.details.pit.target = (parseFloat(row[15]) || 0) * 1000000;
                commune.baseTax.details.pit.ytd = (parseFloat(row[16]) || 0) * 1000000;
                commune.baseTax.details.registration.target = (parseFloat(row[17]) || 0) * 1000000;
                commune.baseTax.details.registration.ytd = (parseFloat(row[18]) || 0) * 1000000;
                commune.baseTax.details.others.target = (parseFloat(row[19]) || 0) * 1000000;
                commune.baseTax.details.others.ytd = (parseFloat(row[20]) || 0) * 1000000;
              } else {
                // Nhập định dạng mẫu 11 cột cũ: Đổ tạm vào Thuế Cơ Sở và reset Thuế Tỉnh về 0
                commune.provinceTax.details.land.target = 0;
                commune.provinceTax.details.land.ytd = 0;
                commune.provinceTax.details.business.target = 0;
                commune.provinceTax.details.business.ytd = 0;
                commune.provinceTax.details.pit.target = 0;
                commune.provinceTax.details.pit.ytd = 0;
                commune.provinceTax.details.registration.target = 0;
                commune.provinceTax.details.registration.ytd = 0;
                commune.provinceTax.details.others.target = 0;
                commune.provinceTax.details.others.ytd = 0;

                commune.baseTax.details.land.target = (parseFloat(row[1]) || 0) * 1000000;
                commune.baseTax.details.land.ytd = (parseFloat(row[2]) || 0) * 1000000;
                commune.baseTax.details.business.target = (parseFloat(row[3]) || 0) * 1000000;
                commune.baseTax.details.business.ytd = (parseFloat(row[4]) || 0) * 1000000;
                commune.baseTax.details.pit.target = (parseFloat(row[5]) || 0) * 1000000;
                commune.baseTax.details.pit.ytd = (parseFloat(row[6]) || 0) * 1000000;
                commune.baseTax.details.registration.target = (parseFloat(row[7]) || 0) * 1000000;
                commune.baseTax.details.registration.ytd = (parseFloat(row[8]) || 0) * 1000000;
                commune.baseTax.details.others.target = (parseFloat(row[9]) || 0) * 1000000;
                commune.baseTax.details.others.ytd = (parseFloat(row[10]) || 0) * 1000000;
              }

              // Tính toán lại
              updateCommuneDerivedFields(commune, i * 2, oldCommune);
              updateCount++;
            }
          }
        }

        if (updateCount > 0) {
          // Áp dụng ngày báo cáo cũ làm ngày báo cáo liền trước
          currentData.metadata.previousReportDate = oldData.metadata.reportDate;
          
          // Áp dụng ngày báo cáo mới
          currentData.metadata.reportDate = reportDate;
          reportDatePickerEl.value = reportDate;
          const prdEl2 = document.getElementById("print-report-date");
          if (prdEl2) prdEl2.textContent = formatDate(reportDate);
          updateLastUpdateTime();

          // Lưu lịch sử snapshot
          saveSnapshot("Cập nhật Excel định kỳ", "Excel");
          
          // Khởi chạy đồng bộ hóa giao diện và lưu trữ localStorage
          onCommuneSelected();
          renderSidebar();
          closePeriodicPanel();
          showToast(`Đã nạp thành công số liệu Excel cho ${updateCount} xã!`);
        } else {
          alert("Không tìm thấy xã nào khớp trong file Excel. Vui lòng kiểm tra lại cột 'Tên Xã'!");
        }
      } catch (err) {
        alert("Lỗi khi phân tích file Excel: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    fileImportExcel.value = "";
  });

  // Đăng ký sự kiện click nút hủy lọc bảng
  if (btnClearTableFilter) {
    btnClearTableFilter.addEventListener("click", () => {
      selectedCommuneId = "tong_hop";
      onCommuneSelected();
      renderSidebar();
    });
  }

  // Khởi chạy ban đầu
  onCommuneSelected();
  renderSidebar();
  renderQuickFilters();

  // Điều chỉnh giao diện trên điện thoại
  function adjustMobileLayout() {
    const appContainer = document.querySelector('.app-container');
    const sidebar = document.querySelector('.sidebar');
    const quickFilters = document.getElementById('quick-commune-filters');
    const modeSelectorContainer = document.querySelector('.view-mode-container');
    const contentHeader = document.querySelector('.content-header');
    const headerFlexRow = document.querySelector('.header-flex-row');

    if (window.innerWidth <= 768) {
      if (quickFilters && quickFilters.parentNode !== appContainer) {
        appContainer.insertBefore(quickFilters, sidebar);
        quickFilters.style.padding = "10px 1rem 0 1rem";
      }
      if (modeSelectorContainer && modeSelectorContainer.parentNode !== appContainer) {
        appContainer.insertBefore(modeSelectorContainer, sidebar);
        modeSelectorContainer.style.margin = "10px 1rem 15px 1rem";
        modeSelectorContainer.style.width = "calc(100% - 2rem)";
        modeSelectorContainer.style.justifyContent = "space-between";
      }
    } else {
      if (quickFilters && contentHeader && quickFilters.parentNode !== contentHeader) {
        contentHeader.insertBefore(quickFilters, contentHeader.firstChild);
        quickFilters.style.padding = "";
      }
      if (modeSelectorContainer && headerFlexRow && modeSelectorContainer.parentNode !== headerFlexRow) {
        headerFlexRow.appendChild(modeSelectorContainer);
        modeSelectorContainer.style.margin = "";
        modeSelectorContainer.style.width = "fit-content";
        modeSelectorContainer.style.justifyContent = "";
      }
    }
  }

  adjustMobileLayout();
  window.addEventListener('resize', adjustMobileLayout);
});
