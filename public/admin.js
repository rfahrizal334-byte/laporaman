/* LaporAman — logika panel peninjauan */
(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const STATUS_LABELS = {
    menunggu: "Menunggu peninjauan",
    diverifikasi: "Sedang diverifikasi",
    prioritas: "Prioritas ditentukan",
    diteruskan: "Diteruskan",
    ditutup: "Selesai",
  };
  const PRIORITY_LABELS = { rendah: "Rendah", sedang: "Sedang", tinggi: "Tinggi" };

  const state = { reports: [], selectedId: null, lastFocused: null };

  /* ---------- Utilitas ---------- */
  async function api(path, options = {}) {
    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Permintaan gagal.");
    return data;
  }

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
  function renderStats(summary) {
    $("#statTotal").textContent = summary.total ?? 0;
    $("#statWaiting").textContent = summary.menunggu ?? 0;
    $("#statProcess").textContent = summary.diproses ?? 0;
    $("#statForwarded").textContent = summary.diteruskan ?? 0;
    $("#statUrgent").textContent = summary.urgensi_tinggi ?? 0;
  }

  async function loadAll() {
    try {
      const [summary, list] = await Promise.all([
        api("/api/admin/summary"),
        api("/api/admin/reports"),
      ]);
      renderStats(summary);
      state.reports = list.reports || [];
      renderTable();
    } catch (error) {
      showToast(error.message || "Gagal memuat laporan.");
    }
  }

  /* ---------- Tabel ---------- */
  function renderTable() {
    const term = $("#searchInput").value.trim().toLowerCase();
    const statusFilter = $("#statusFilter").value;

    const filtered = state.reports.filter((report) => {
      const matchStatus = !statusFilter || report.status === statusFilter;
      const haystack = [
        report.kategori, report.lokasi, report.ticket_hint, report.waktu,
      ].join(" ").toLowerCase();
      return matchStatus && (!term || haystack.includes(term));
    });

    const tbody = $("#reportRows");
    tbody.textContent = "";

    filtered.forEach((report) => {
      const row = document.createElement("tr");

      const ticketCell = document.createElement("td");
      ticketCell.className = "cell-ticket";
      ticketCell.textContent = `••••-${report.ticket_hint}`;
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
      dateCell.textContent = formatDate(report.created_at);
      row.appendChild(dateCell);

      const actionCell = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn-detail";
      button.textContent = "Tinjau";
      button.addEventListener("click", () => openDetail(report.id));
      actionCell.appendChild(button);
      row.appendChild(actionCell);

      tbody.appendChild(row);
    });

    $("#emptyState").hidden = filtered.length > 0;
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

  async function openDetail(id) {
    try {
      const data = await api(`/api/admin/reports/${id}`);
      const report = data.report;
      state.selectedId = id;
      state.lastFocused = document.activeElement;

      $("#detailTitle").textContent = `Tiket ••••-${report.ticket_hint}`;

      const meta = $("#detailMeta");
      meta.textContent = "";
      meta.append(
        metaItem("Kategori", report.kategori),
        metaItem("Lokasi", report.lokasi),
        metaItem("Waktu kejadian", report.waktu),
        metaItem("Urgensi pelapor", report.urgensi),
        metaItem("Status", STATUS_LABELS[report.status] || report.status),
        metaItem("Prioritas", PRIORITY_LABELS[report.prioritas] || report.prioritas),
        metaItem("Masuk", formatDate(report.created_at)),
        metaItem("Diperbarui", formatDate(report.updated_at))
      );

      $("#detailChronology").textContent = report.kronologi;

      const evidence = $("#detailEvidence");
      evidence.textContent = "";
      if (report.has_evidence) {
        const image = document.createElement("img");
        image.src = `/api/admin/reports/${id}/evidence`;
        image.alt = "Bukti foto laporan";
        evidence.appendChild(image);
      } else {
        const empty = document.createElement("p");
        empty.textContent = "Tidak ada foto yang disertakan.";
        evidence.appendChild(empty);
      }

      const timeline = $("#detailTimeline");
      timeline.textContent = "";
      (data.timeline || []).forEach((item) => {
        const entry = document.createElement("div");
        entry.className = "mini-item";
        const strong = document.createElement("strong");
        strong.textContent = item.label;
        const note = document.createElement("span");
        note.textContent = item.note || "";
        const time = document.createElement("small");
        time.textContent = formatDate(item.created_at);
        entry.append(strong, note, time);
        timeline.appendChild(entry);
      });

      $("#updateStatus").value = report.status;
      $("#updatePriority").value = report.prioritas;
      $("#updatePublicNote").value = report.public_note || "";
      $("#updateAdminNote").value = report.admin_note || "";

      drawer.hidden = false;
      $("#updateStatus").focus();
    } catch (error) {
      showToast(error.message || "Gagal membuka detail laporan.");
    }
  }

  /* ---------- Simpan pembaruan ---------- */
  $("#updateForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.selectedId) return;

    const button = $("#saveButton");
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Menyimpan…";

    try {
      await api(`/api/admin/reports/${state.selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: $("#updateStatus").value,
          prioritas: $("#updatePriority").value,
          publicNote: $("#updatePublicNote").value,
          adminNote: $("#updateAdminNote").value,
        }),
      });
      showToast("Pembaruan tersimpan.");
      await loadAll();
      await openDetail(state.selectedId);
    } catch (error) {
      showToast(error.message || "Gagal menyimpan pembaruan.");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  loadAll();
})();
