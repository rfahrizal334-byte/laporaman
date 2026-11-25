/* LaporAman — panel peninjau (localStorage, tanpa server) */
(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const STORAGE_KEY = "laporaman_reports_v1";

  const STATUS_LABELS = {
    menunggu: "Menunggu peninjauan",
    diverifikasi: "Sedang diverifikasi",
    prioritas: "Prioritas ditentukan",
    diteruskan: "Diteruskan",
    ditutup: "Selesai",
  };
  const PRIORITY_LABELS = { rendah: "Rendah", sedang: "Sedang", tinggi: "Tinggi" };

  const state = { reports: [], selectedTicket: null, lastFocused: null };

  /* ---------- Penyimpanan ---------- */
  function loadReports() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function saveReports(reports) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  }

  /* ---------- Utilitas ---------- */
  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("id-ID", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  const toast = $("#adminToast");
  let toastTimer;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3000);
  }

  function badge(text, modifier) {
    const span = document.createElement("span");
    span.className = "badge" + (modifier ? " badge--" + modifier : "");
    span.textContent = text;
    return span;
  }

  function metaItem(label, value) {
    const div = document.createElement("div");
    div.className = "meta-item";
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value || "—";
    div.append(span, strong);
    return div;
  }

  /* ---------- Ringkasan ---------- */
  function renderStats() {
    const reports = state.reports;
    $("#statTotal").textContent = reports.length;
    $("#statWaiting").textContent = reports.filter((r) => r.status === "menunggu").length;
    $("#statProcess").textContent = reports.filter((r) =>
      ["diverifikasi", "prioritas"].includes(r.status)
    ).length;
    $("#statForwarded").textContent = reports.filter((r) => r.status === "diteruskan").length;
    $("#statUrgent").textContent = reports.filter((r) => r.urgensi === "Tinggi").length;
  }

  function loadAll() {
    state.reports = loadReports();
    renderStats();
    renderTable();
  }

  /* ---------- Tabel ---------- */
  function renderTable() {
    const term = $("#searchInput").value.trim().toLowerCase();
    const statusFilter = $("#statusFilter").value;

    const filtered = state.reports.filter((report) => {
      const matchStatus = !statusFilter || report.status === statusFilter;
      const haystack = [report.kategori, report.lokasi, report.ticket, report.waktu]
        .join(" ")
        .toLowerCase();
      return matchStatus && (!term || haystack.includes(term));
    });

    const tbody = $("#reportRows");
    tbody.textContent = "";

    filtered.forEach((report) => {
      const row = document.createElement("tr");

      const ticketCell = document.createElement("td");
      ticketCell.className = "cell-ticket";
      ticketCell.textContent = `••••-${report.ticket.slice(-4)}`;
      row.appendChild(ticketCell);

      const categoryCell = document.createElement("td");
      categoryCell.textContent = report.kategori;
      row.appendChild(categoryCell);

      const locationCell = document.createElement("td");
      locationCell.className = "cell-location";
      locationCell.textContent = report.lokasi;
      row.appendChild(locationCell);

      const urgencyCell = document.createElement("td");
      urgencyCell.appendChild(badge(report.urgensi, String(report.urgensi).toLowerCase()));
      row.appendChild(urgencyCell);

      const statusCell = document.createElement("td");
      statusCell.appendChild(badge(STATUS_LABELS[report.status] || report.status, report.status));
      row.appendChild(statusCell);

      const priorityCell = document.createElement("td");
      priorityCell.appendChild(badge(PRIORITY_LABELS[report.prioritas] || report.prioritas, report.prioritas));
      row.appendChild(priorityCell);

      const dateCell = document.createElement("td");
      dateCell.textContent = formatDate(report.createdAt);
      row.appendChild(dateCell);

      const actionCell = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn-detail";
      button.textContent = "Tinjau";
      button.addEventListener("click", () => openDetail(report.ticket));
      actionCell.appendChild(button);
      row.appendChild(actionCell);

      tbody.appendChild(row);
    });

    const emptyState = $("#emptyState");
    emptyState.hidden = filtered.length > 0;
    if (filtered.length === 0) {
      const hasAny = state.reports.length > 0;
      $("#emptyTitle").textContent = hasAny
        ? "Tidak ada laporan yang cocok dengan filter."
        : "Belum ada laporan di browser ini.";
      $("#emptyHint").textContent = hasAny
        ? "Ubah kata kunci pencarian atau pilih status lain."
        : "Laporan hanya muncul di browser & perangkat tempat laporan dikirim. Pastikan halaman yang dipakai mengirim laporan masih satu browser yang sama.";
      $("#sampleButton").hidden = hasAny;
    }
    renderStorageStatus();
  }

  function renderStorageStatus() {
    $("#storageStatus").textContent =
      `Origin: ${location.origin}  •  ${state.reports.length} laporan tersimpan di localStorage`;
  }

  $("#searchInput").addEventListener("input", renderTable);
  $("#statusFilter").addEventListener("change", renderTable);
  $("#refreshButton").addEventListener("click", loadAll);

  /* ---------- Detail ---------- */
  const drawer = $("#detailDrawer");
  const panel = $(".drawer__panel", drawer);

  function closeDetail() {
    drawer.hidden = true;
    if (state.lastFocused && typeof state.lastFocused.focus === "function") {
      state.lastFocused.focus();
    }
  }

  $$("[data-close-detail]", drawer).forEach((element) =>
    element.addEventListener("click", closeDetail)
  );

  document.addEventListener("keydown", (event) => {
    if (drawer.hidden) return;
    if (event.key === "Escape") {
      closeDetail();
      return;
    }
    if (event.key === "Tab") {
      const focusable = $$(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        panel
      ).filter((element) => !element.disabled);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  function openDetail(ticket) {
    const report = loadReports().find((item) => item.ticket === ticket);
    if (!report) {
      showToast("Laporan tidak ditemukan.");
      loadAll();
      return;
    }

    state.selectedTicket = ticket;
    state.lastFocused = document.activeElement;

    $("#detailTitle").textContent = `Tiket ••••-${report.ticket.slice(-4)}`;

    const meta = $("#detailMeta");
    meta.textContent = "";
    meta.append(
      metaItem("Kategori", report.kategori),
      metaItem("Lokasi", report.lokasi),
      metaItem("Waktu kejadian", report.waktu),
      metaItem("Urgensi pelapor", report.urgensi),
      metaItem("Status", STATUS_LABELS[report.status] || report.status),
      metaItem("Prioritas", PRIORITY_LABELS[report.prioritas] || report.prioritas),
      metaItem("Masuk", formatDate(report.createdAt)),
      metaItem("Diperbarui", formatDate(report.updatedAt))
    );

    $("#detailChronology").textContent = report.kronologi;

    const evidence = $("#detailEvidence");
    evidence.textContent = "";
    if (report.evidence) {
      const image = document.createElement("img");
      image.src = report.evidence;
      image.alt = "Bukti foto laporan";
      evidence.appendChild(image);
    } else {
      const empty = document.createElement("p");
      empty.textContent = "Tidak ada foto yang disertakan.";
      evidence.appendChild(empty);
    }

    const timeline = $("#detailTimeline");
    timeline.textContent = "";
    (report.timeline || []).forEach((item) => {
      const entry = document.createElement("div");
      entry.className = "mini-item";
      const strong = document.createElement("strong");
      strong.textContent = item.label;
      const note = document.createElement("span");
      note.textContent = item.note || "";
      const time = document.createElement("small");
      time.textContent = formatDate(item.at);
      entry.append(strong, note, time);
      timeline.appendChild(entry);
    });

    $("#updateStatus").value = report.status;
    $("#updatePriority").value = report.prioritas;
    $("#updatePublicNote").value = report.publicNote || "";
    $("#updateAdminNote").value = report.adminNote || "";

    drawer.hidden = false;
    $("#updateStatus").focus();
  }

  /* ---------- Simpan pembaruan ---------- */
  $("#updateForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.selectedTicket) return;

    const reports = loadReports();
    const report = reports.find((item) => item.ticket === state.selectedTicket);
    if (!report) {
      showToast("Laporan tidak ditemukan lagi.");
      closeDetail();
      loadAll();
      return;
    }

    const newStatus = $("#updateStatus").value;
    const statusChanged = newStatus !== report.status;
    const now = new Date().toISOString();

    report.status = newStatus;
    report.prioritas = $("#updatePriority").value;
    report.publicNote = $("#updatePublicNote").value.trim();
    report.adminNote = $("#updateAdminNote").value.trim();
    report.updatedAt = now;

    if (statusChanged) {
      report.timeline = Array.isArray(report.timeline) ? report.timeline : [];
      report.timeline.push({
        label: STATUS_LABELS[newStatus] || newStatus,
        note: report.publicNote || "Status diperbarui oleh peninjau.",
        at: now,
      });
    }

    try {
      saveReports(reports);
      showToast("Pembaruan tersimpan.");
      loadAll();
      openDetail(report.ticket);
    } catch (error) {
      showToast("Gagal menyimpan: penyimpanan browser penuh.");
    }
  });

  /* ---------- Hapus laporan ---------- */
  $("#deleteButton").addEventListener("click", () => {
    if (!state.selectedTicket) return;
    const report = state.reports.find((item) => item.ticket === state.selectedTicket);
    const label = report ? ` ••••-${report.ticket.slice(-4)}` : "";
    if (!window.confirm(`Hapus laporan${label} dari perangkat ini? Tindakan ini tidak bisa dibatalkan.`)) {
      return;
    }

    const reports = loadReports().filter((item) => item.ticket !== state.selectedTicket);
    try {
      saveReports(reports);
      showToast("Laporan dihapus.");
      closeDetail();
      loadAll();
    } catch (error) {
      showToast("Gagal menghapus laporan.");
    }
  });

  /* ---------- Contoh laporan (untuk presentasi/demo) ---------- */
  function randomChars(length) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    if (window.crypto && window.crypto.getRandomValues) {
      const values = new Uint32Array(length);
      window.crypto.getRandomValues(values);
      values.forEach((value) => {
        result += alphabet[value % alphabet.length];
      });
      return result;
    }
    for (let i = 0; i < length; i += 1) {
      result += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return result;
  }

  $("#sampleButton").addEventListener("click", () => {
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("");
    const iso = now.toISOString();
    const sample = {
      ticket: `LA-${date}-${randomChars(6)}`,
      kategori: "Potensi tawuran",
      lokasi: "Depan gerbang sekolah (contoh)",
      waktu: "Hari ini",
      urgensi: "Sedang",
      kronologi:
        "Contoh laporan untuk keperluan presentasi. Ada kumpulan remaja yang saling menantang usai pulang sekolah.",
      evidence: null,
      status: "menunggu",
      prioritas: "sedang",
      publicNote: "",
      adminNote: "",
      createdAt: iso,
      updatedAt: iso,
      timeline: [
        { label: "Laporan diterima", note: "Aduan tersimpan di browser perangkat ini.", at: iso },
      ],
    };

    const reports = loadReports();
    reports.push(sample);
    try {
      saveReports(reports);
      showToast("Contoh laporan dibuat.");
      loadAll();
    } catch (error) {
      showToast("Gagal menyimpan: penyimpanan browser penuh.");
    }
  });

  /* ---------- Segarkan otomatis ---------- */
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadAll();
  });
  window.addEventListener("focus", loadAll);
  setInterval(() => {
    if (!document.hidden) loadAll();
  }, 4000);

  loadAll();
})();
