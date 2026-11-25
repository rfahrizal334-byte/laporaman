/* LaporAman — frontend untuk backend Express + PostgreSQL */
(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

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

  /* ---------- Tahun footer ---------- */
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

  fileInput.addEventListener("change", () => {
    $("#fileHint").textContent = fileInput.files.length
      ? `Berkas dipilih: ${fileInput.files[0].name}. Metadata/GPS akan dibersihkan sebelum disimpan.`
      : "Foto diunggah dan metadata/GPS-nya dibersihkan otomatis. Jangan sertakan wajahmu sendiri.";
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

    const payload = new FormData(form);
    payload.set("kategori", $('input[name="kategori"]:checked', form).value);
    if (!fileInput.files.length) payload.delete("bukti");

    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");
    submitButton.textContent = "Mengirim laporan…";

    try {
      const response = await fetch("/api/reports", { method: "POST", body: payload });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Gagal mengirim laporan.");

      openModal(result.ticket);
      form.reset();
      updateCounter();
      Object.keys(fields).forEach((name) => setError(name, false));
      $("#fileHint").textContent =
        "Foto diunggah dan metadata/GPS-nya dibersihkan otomatis. Jangan sertakan wajahmu sendiri.";
    } catch (error) {
      showToast(error.message || "Koneksi gagal. Coba lagi beberapa saat.");
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute("aria-busy");
      submitButton.innerHTML = submitLabel;
    }
  });

  /* ---------- Cek status sungguhan ---------- */
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

  function renderStatus(data) {
    checkResult.innerHTML = `
      <div class="check-result__head">
        <span class="check-result__code"></span>
        <span class="check-result__status"></span>
      </div>
      <div class="check-result__public-note" hidden></div>
      <div class="timeline"></div>
      <p class="check-result__note">Data ditampilkan dari sistem. Untuk kerahasiaan, detail catatan internal peninjau tidak ditampilkan.</p>
    `;

    $(".check-result__code", checkResult).textContent = data.ticket;
    $(".check-result__status", checkResult).textContent = data.statusLabel || data.status;

    if (data.publicNote) {
      const publicNote = $(".check-result__public-note", checkResult);
      publicNote.textContent = data.publicNote;
      publicNote.hidden = false;
    }

    const timeline = $(".timeline", checkResult);
    (data.timeline || []).forEach((item, index) => {
      const element = document.createElement("div");
      element.className = "timeline__item" + (index === (data.timeline.length - 1) ? " is-active" : "");

      const strong = document.createElement("strong");
      strong.textContent = item.label;
      const span = document.createElement("span");
      span.textContent = [item.note, formatDate(item.at)].filter(Boolean).join(" • ");

      element.append(strong, span);
      timeline.appendChild(element);
    });

    checkResult.hidden = false;
  }

  checkForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = ticketInput.value.trim();

    if (value.length < 3) {
      ticketError.hidden = false;
      ticketInput.focus();
      return;
    }

    ticketError.hidden = true;
    const button = $("button", checkForm);
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Mencari…";

    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(value)}/status`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        checkResult.hidden = true;
        throw new Error(result.error || "Kode tiket tidak ditemukan.");
      }
      renderStatus(result);
    } catch (error) {
      showToast(error.message || "Gagal menghubungi server.");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  updateCounter();
})();
