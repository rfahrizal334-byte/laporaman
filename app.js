/* LaporAman — versi statis: semua data disimpan di localStorage browser */
(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const STORAGE_KEY = "laporaman_reports_v1";

  const STATUS_LABELS = {
    menunggu: "Menunggu peninjauan",
    diverifikasi: "Sedang diverifikasi",
    prioritas: "Prioritas ditentukan",
    diteruskan: "Diteruskan ke pihak setempat",
    ditutup: "Selesai ditangani",
  };

  /* ---------- Penyimpanan lokal ---------- */
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

  function storeReport(report) {
    const reports = loadReports();
    reports.push(report);
    try {
      saveReports(reports);
      return true;
    } catch (error) {
      // Kuota penuh: coba ulangi tanpa foto agar laporan tetap tersimpan.
      report.evidence = null;
      try {
        saveReports(reports);
        return true;
      } catch (retryError) {
        return false;
      }
    }
  }

  /* ---------- Navigasi mobile ---------- */
  const navToggle = $(".nav-toggle");
  const nav = $("#site-nav");

  function closeNav() {
    nav.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Buka menu");
  }

  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
    navToggle.setAttribute("aria-label", isOpen ? "Tutup menu" : "Buka menu");
  });
  $$("a", nav).forEach((link) => link.addEventListener("click", closeNav));

  $("#year").textContent = String(new Date().getFullYear());

  /* ---------- Toast ---------- */
  const toast = $("#toast");
  let toastTimer;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3000);
  }

  /* ---------- Tiket acak ---------- */
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

  function createTicket() {
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("");
    return `LA-${date}-${randomChars(6)}`;
  }

  /* ---------- Kompresi foto (sekaligus membuang EXIF/GPS) ---------- */
  function compressImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve(null);
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => resolve(null);
        image.onload = () => {
          const maxSize = 1024;
          let { width, height } = image;
          if (width > maxSize || height > maxSize) {
            const scale = Math.min(maxSize / width, maxSize / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(image, 0, 0, width, height);
          // toDataURL() menghasilkan gambar baru tanpa metadata EXIF/GPS.
          resolve(canvas.toDataURL("image/jpeg", 0.6));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------- Form laporan ---------- */
  const form = $("#reportForm");
  const submitButton = $("#submitReport");
  const submitLabel = submitButton.innerHTML;
  const kronologi = $("#kronologi");
  const counter = $("#charCounter");
  const fileInput = $("#bukti");

  const fields = {
    kategori: $("#kategoriError"),
    lokasi: $("#lokasiError"),
    waktu: $("#waktuError"),
    kronologi: $("#kronologiError"),
    consent: $("#consentError"),
  };

  function setError(name, show) {
    if (fields[name]) fields[name].hidden = !show;
  }

  function updateCounter() {
    counter.textContent = `${kronologi.value.length} karakter`;
  }

  kronologi.addEventListener("input", () => {
    updateCounter();
    setError("kronologi", false);
  });

  $$('input[name="kategori"]', form).forEach((radio) =>
    radio.addEventListener("change", () => setError("kategori", false))
  );
  ["lokasi", "waktu"].forEach((id) => {
    $("#" + id).addEventListener("input", () => setError(id, false));
  });
  $("#consent").addEventListener("change", () => setError("consent", false));

  const FILE_HINT_DEFAULT =
    "Foto disusutkan dan disimpan lokal di browser ini. Jangan sertakan wajahmu sendiri.";

  fileInput.addEventListener("change", () => {
    $("#fileHint").textContent = fileInput.files.length
      ? `Berkas dipilih: ${fileInput.files[0].name}. Foto akan disusutkan sebelum disimpan.`
      : FILE_HINT_DEFAULT;
  });

  function validateForm() {
    const errors = [];
    setError("kategori", !$('input[name="kategori"]:checked', form));
    setError("lokasi", !$("#lokasi").value.trim());
    setError("waktu", !$("#waktu").value);
    setError("kronologi", kronologi.value.trim().length < 20);
    setError("consent", !$("#consent").checked);

    Object.keys(fields).forEach((name) => {
      if (!fields[name].hidden) errors.push(name);
    });
    return errors;
  }

  /* ---------- Modal tiket ---------- */
  const modal = $("#ticketModal");
  const dialog = $(".modal__dialog", modal);
  const ticketCode = $("#ticketCode");
  let lastFocused = null;

  function openModal(code) {
    lastFocused = document.activeElement;
    ticketCode.textContent = code;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    $("#copyTicket").focus();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  }

  $$("[data-close-modal]", modal).forEach((element) =>
    element.addEventListener("click", closeModal)
  );

  document.addEventListener("keydown", (event) => {
    if (modal.hidden) return;
    if (event.key === "Escape") {
      closeModal();
      return;
    }
    if (event.key === "Tab") {
      const focusable = $$(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        dialog
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

  $("#copyTicket").addEventListener("click", async () => {
    const code = ticketCode.textContent;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
      } else {
        const helper = document.createElement("textarea");
        helper.value = code;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        helper.remove();
      }
      showToast("Kode tiket disalin.");
    } catch (error) {
      showToast("Gagal menyalin. Silakan pilih kode secara manual.");
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errors = validateForm();

    if (errors.length) {
      const first = errors[0] === "kategori"
        ? $('input[name="kategori"]', form)
        : $("#" + errors[0]);
      if (first) first.focus();
      showToast("Lengkapi kolom yang ditandai terlebih dahulu.");
      return;
    }

    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");
    submitButton.textContent = "Menyimpan laporan…";

    try {
      const file = fileInput.files[0] || null;
      const evidence = file ? await compressImage(file) : null;
      const now = new Date().toISOString();
      const ticket = createTicket();

      const report = {
        ticket: ticket,
        kategori: $('input[name="kategori"]:checked', form).value,
        lokasi: $("#lokasi").value.trim(),
        waktu: $("#waktu").value,
        urgensi: $("#urgensi").value,
        kronologi: kronologi.value.trim(),
        evidence: evidence,
        status: "menunggu",
        prioritas: "sedang",
        publicNote: "",
        adminNote: "",
        createdAt: now,
        updatedAt: now,
        timeline: [
          { label: "Laporan diterima", note: "Aduan tersimpan di browser perangkat ini.", at: now },
        ],
      };

      if (!storeReport(report)) {
        throw new Error("Penyimpanan browser penuh. Hapus sebagian data laporan di panel admin lalu coba lagi.");
      }

      openModal(ticket);
      form.reset();
      updateCounter();
      Object.keys(fields).forEach((name) => setError(name, false));
      $("#fileHint").textContent = FILE_HINT_DEFAULT;
    } catch (error) {
      showToast(error.message || "Gagal menyimpan laporan.");
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute("aria-busy");
      submitButton.innerHTML = submitLabel;
    }
  });

  /* ---------- Cek status ---------- */
  const checkForm = $("#checkForm");
  const ticketInput = $("#ticketInput");
  const checkResult = $("#checkResult");
  const ticketError = $("#ticketError");

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("id-ID", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  function renderStatus(report) {
    checkResult.innerHTML = `
      <div class="check-result__head">
        <span class="check-result__code"></span>
        <span class="check-result__status"></span>
      </div>
      <div class="check-result__public-note" hidden></div>
      <div class="timeline"></div>
      <p class="check-result__note">Data ditampilkan dari penyimpanan lokal browser ini.</p>
    `;

    $(".check-result__code", checkResult).textContent = report.ticket;
    $(".check-result__status", checkResult).textContent =
      STATUS_LABELS[report.status] || report.status;

    if (report.publicNote) {
      const publicNote = $(".check-result__public-note", checkResult);
      publicNote.textContent = report.publicNote;
      publicNote.hidden = false;
    }

    const timeline = $(".timeline", checkResult);
    (report.timeline || []).forEach((item, index) => {
      const element = document.createElement("div");
      element.className =
        "timeline__item" + (index === (report.timeline.length - 1) ? " is-active" : "");
      const strong = document.createElement("strong");
      strong.textContent = item.label;
      const span = document.createElement("span");
      span.textContent = [item.note, formatDate(item.at)].filter(Boolean).join(" • ");
      element.append(strong, span);
      timeline.appendChild(element);
    });

    checkResult.hidden = false;
  }

  checkForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = ticketInput.value.trim().toUpperCase();

    if (value.length < 3) {
      ticketError.hidden = false;
      ticketInput.focus();
      return;
    }

    ticketError.hidden = true;
    const report = loadReports().find((item) => item.ticket === value);

    if (!report) {
      checkResult.hidden = true;
      showToast("Kode tiket tidak ditemukan di perangkat ini.");
      return;
    }

    renderStatus(report);
  });

  updateCounter();
})();
