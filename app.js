/* ================================================================
   SITE CONFIGURATION
   แก้ไขข้อมูลคำเชิญ พิกัด และ PromptPay ได้จากจุดนี้เพียงจุดเดียว
   ================================================================ */
const CONFIG = {
  siteTitle: "เรียนเชิญร่วมพิธีทำบุญขึ้นบ้านใหม่",
  invitationText: "ขอเรียนเชิญท่านเพื่อเป็นเกียรติเนื่องในงาน",
  hostName: "นายพิมล ตุ่นกระโทก และ นางวิภาวดี ตุ่นกระโทก",
  heading: "พิธีทำบุญขึ้นบ้านใหม่",
  description: "ขอเรียนเชิญร่วมพิธีเพื่อความเป็นสิริมงคล และร่วมรับประทานอาหาร",
  eventDateLabel: "วันศุกร์ที่ 24 กรกฎาคม พ.ศ. 2569",
  eventDateShort: "24 กรกฎาคม 2569",
  eventTime: "09:09 น.",
  mealTime: "12:00 น.",
  addressLine1: "บ้านเลขที่ 129 ตำบล ทุ่งกุลา",
  addressLine2: "อำเภอ ท่าตูม จังหวัด สุรินทร์",
  latitude: 15.435534,
  longitude: 103.648366,

  // IMPORTANT: Replace this sample PromptPay ID before deployment.
  // This value will be visible in the public source code and QR image URL.
  promptPayId: "0887263735",

  promptPayRecipient: "นายพิมล ตุ่นกระโทก",
  defaultAmount: "500",
  currency: "THB",
  locale: "th-TH",

  // Add the deployed Supabase submit-slip Edge Function URL here.
  // It receives the guest name, slip, amount, event title, Turnstile token, and retry ID.
  // If left blank, guests can send their name and slip with their phone's share sheet.
  slipSubmissionUrl: "https://cenhvwhkpvthqyrqndgl.supabase.co/functions/v1/submit-slip",

  // Public Cloudflare Turnstile site key. Required when slipSubmissionUrl is set.
  // The matching secret key belongs only in Supabase Edge Function secrets.
  turnstileSiteKey: "0x4AAAAAAD0RGv1VNoegOo_Y"
};

(function initializeInvitation() {
  "use strict";

  const elements = {
    qr: document.querySelector("#promptpay-qr"),
    qrLoader: document.querySelector("#qr-loader"),
    amountForm: document.querySelector("#amount-form"),
    amount: document.querySelector("#amount"),
    amountError: document.querySelector("#amount-error"),
    directions: document.querySelector("#directions-link"),
    openPayment: document.querySelector("#open-payment-link"),
    sharePayment: document.querySelector("#share-payment-link"),
    copyPayment: document.querySelector("#copy-payment-link"),
    copyPromptPayId: document.querySelector("#copy-promptpay-id"),
    idDisplay: document.querySelector("#promptpay-id-display"),
    slipForm: document.querySelector("#slip-form"),
    slipDialog: document.querySelector("#slip-dialog"),
    openSlipDialog: document.querySelector("#open-slip-dialog"),
    closeSlipDialog: document.querySelector("#close-slip-dialog"),
    guestName: document.querySelector("#guest-name"),
    guestNameError: document.querySelector("#guest-name-error"),
    slipFile: document.querySelector("#slip-file"),
    slipError: document.querySelector("#slip-error"),
    slipPreview: document.querySelector("#slip-preview"),
    slipPreviewImage: document.querySelector("#slip-preview-image"),
    slipFileName: document.querySelector("#slip-file-name"),
    slipFileSize: document.querySelector("#slip-file-size"),
    removeSlip: document.querySelector("#remove-slip"),
    slipSubmit: document.querySelector("#slip-submit"),
    slipSubmitLabel: document.querySelector("#slip-submit-label"),
    slipStatus: document.querySelector("#slip-status"),
    slipDeliveryHelp: document.querySelector("#slip-delivery-help"),
    turnstileContainer: document.querySelector("#turnstile-container"),
    toast: document.querySelector("#toast")
  };

  let currentPaymentUrl = "";
  let updateTimer;
  let toastTimer;
  let previewUrl = "";
  let turnstileWidgetId = null;
  let turnstileToken = "";
  let turnstileInitialized = false;
  let pendingSubmissionId = createSubmissionId();

  document.title = CONFIG.siteTitle;
  document.querySelectorAll("[data-config]").forEach((element) => {
    const key = element.dataset.config;
    if (Object.prototype.hasOwnProperty.call(CONFIG, key)) {
      element.textContent = CONFIG[key];
    }
  });

  const hostNameElement = document.querySelector('[data-config="hostName"]');
  const hostNames = CONFIG.hostName.split(/\s+และ\s+/).map((name) => name.trim()).filter(Boolean);
  if (hostNameElement && hostNames.length === 2) {
    hostNameElement.replaceChildren();
    const firstHost = document.createElement("span");
    const conjunction = document.createElement("span");
    const secondHost = document.createElement("span");
    firstHost.className = "host-name__person";
    conjunction.className = "host-name__and";
    secondHost.className = "host-name__person";
    firstHost.textContent = hostNames[0];
    conjunction.textContent = "และ";
    secondHost.textContent = hostNames[1];
    hostNameElement.append(firstHost, conjunction, secondHost);
  }

  const coordinatesAreValid = Number.isFinite(CONFIG.latitude)
    && Number.isFinite(CONFIG.longitude)
    && CONFIG.latitude >= -90 && CONFIG.latitude <= 90
    && CONFIG.longitude >= -180 && CONFIG.longitude <= 180;

  if (coordinatesAreValid) {
    const destination = `${CONFIG.latitude},${CONFIG.longitude}`;
    elements.directions.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  } else {
    elements.directions.removeAttribute("href");
    elements.directions.setAttribute("aria-disabled", "true");
    elements.directions.addEventListener("click", (event) => {
      event.preventDefault();
      showToast("ยังไม่ได้ตั้งค่าพิกัดสถานที่จัดงาน");
    });
  }

  const normalizedPromptPayId = String(CONFIG.promptPayId).replace(/[^0-9]/g, "");
  elements.idDisplay.textContent = normalizedPromptPayId;
  elements.amount.value = CONFIG.defaultAmount;

  function getValidatedAmount() {
    const rawValue = elements.amount.value.trim();
    elements.amountError.textContent = "";
    elements.amount.removeAttribute("aria-invalid");

    if (rawValue === "") return "";

    const amount = Number(rawValue);
    if (!Number.isFinite(amount) || amount < 0.01 || amount > 999999.99) {
      elements.amountError.textContent = "กรุณาระบุจำนวนเงินตั้งแต่ 0.01 ถึง 999,999.99 บาท";
      elements.amount.setAttribute("aria-invalid", "true");
      return null;
    }

    return amount.toFixed(2);
  }

  function buildPromptPayUrl(amount) {
    const baseUrl = `https://promptpay.io/${encodeURIComponent(normalizedPromptPayId)}`;
    return amount ? `${baseUrl}/${encodeURIComponent(amount)}.png` : `${baseUrl}.png`;
  }

  function updatePaymentDetails() {
    const amount = getValidatedAmount();
    if (amount === null) return;

    currentPaymentUrl = buildPromptPayUrl(amount);
    elements.openPayment.href = currentPaymentUrl;
    elements.qr.classList.remove("is-loaded");
    elements.qrLoader.classList.remove("is-error");
    elements.qrLoader.textContent = "กำลังสร้าง QR Code…";
    elements.qrLoader.hidden = false;

    // Clear src first so changing an amount reliably requests a fresh QR image.
    elements.qr.removeAttribute("src");
    requestAnimationFrame(() => {
      elements.qr.src = currentPaymentUrl;
    });
  }

  elements.qr.addEventListener("load", () => {
    elements.qr.classList.add("is-loaded");
    elements.qrLoader.hidden = true;
  });

  elements.qr.addEventListener("error", () => {
    elements.qr.classList.remove("is-loaded");
    elements.qrLoader.hidden = false;
    elements.qrLoader.classList.add("is-error");
    elements.qrLoader.textContent = "ไม่สามารถโหลด QR Code ได้ กรุณาตรวจสอบอินเทอร์เน็ต หรือลองเปิดลิงก์ด้านล่าง";
  });

  elements.amount.addEventListener("input", () => {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(updatePaymentDetails, 350);
  });

  elements.amountForm.addEventListener("submit", (event) => event.preventDefault());

  elements.openPayment.addEventListener("click", (event) => {
    if (!currentPaymentUrl || getValidatedAmount() === null) {
      event.preventDefault();
      elements.amount.focus();
    }
  });

  elements.sharePayment.addEventListener("click", async () => {
    if (getValidatedAmount() === null) {
      elements.amount.focus();
      return;
    }

    const amountText = elements.amount.value.trim()
      ? ` จำนวน ${Number(elements.amount.value).toLocaleString(CONFIG.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`
      : "";
    const shareData = {
      title: CONFIG.siteTitle,
      text: `ลิงก์ PromptPay สำหรับ ${CONFIG.promptPayRecipient}${amountText}`,
      url: currentPaymentUrl
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        if (error.name !== "AbortError") showToast("ไม่สามารถแชร์ลิงก์ได้ กรุณาลองคัดลอกแทน");
      }
    } else {
      await copyPaymentUrl("อุปกรณ์นี้ไม่รองรับเมนูแชร์ จึงคัดลอกลิงก์ให้แล้ว");
    }
  });

  elements.copyPayment.addEventListener("click", () => copyPaymentUrl("คัดลอกลิงก์ PromptPay แล้ว"));
  elements.copyPromptPayId.addEventListener("click", () => {
    copyText(
      normalizedPromptPayId,
      "คัดลอกเลข PromptPay แล้ว",
      "คัดลอกเลขอัตโนมัติไม่ได้ กรุณากดค้างที่หมายเลขเพื่อคัดลอก"
    );
  });

  const slipSubmissionUrl = String(CONFIG.slipSubmissionUrl || "").trim();
  const hasSlipEndpoint = /^https:\/\//i.test(slipSubmissionUrl);
  const turnstileSiteKey = String(CONFIG.turnstileSiteKey || "").trim();
  const maximumSlipSize = 5 * 1024 * 1024;
  const acceptedSlipTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

  if (!hasSlipEndpoint) {
    elements.slipSubmitLabel.textContent = "แชร์ชื่อและสลิป";
    elements.slipDeliveryHelp.textContent = "กรอกชื่อและเลือกรูปสลิป จากนั้นเลือก LINE หรือแอปที่ต้องการส่งให้เจ้าภาพ";
  } else if (!turnstileSiteKey) {
    elements.slipSubmit.disabled = true;
    elements.slipDeliveryHelp.textContent = "ระบบรับสลิปยังตั้งค่าไม่ครบ กรุณาแจ้งเจ้าภาพ";
    showSlipFailure("กรุณาตั้งค่า turnstileSiteKey ใน app.js");
  }

  elements.slipFile.addEventListener("change", () => {
    clearSlipError();
    const file = elements.slipFile.files[0];
    if (!file) {
      hideSlipPreview();
      return;
    }

    const errorMessage = validateSlipFile(file);
    if (errorMessage) {
      elements.slipError.textContent = errorMessage;
      elements.slipFile.setAttribute("aria-invalid", "true");
      elements.slipFile.value = "";
      hideSlipPreview();
      return;
    }

    showSlipPreview(file);
  });

  elements.openSlipDialog.addEventListener("click", () => {
    elements.slipDialog.showModal();
    if (hasSlipEndpoint && turnstileSiteKey && !turnstileInitialized) initializeTurnstile();
    requestAnimationFrame(() => elements.guestName.focus());
  });

  elements.closeSlipDialog.addEventListener("click", () => elements.slipDialog.close());

  elements.slipDialog.addEventListener("click", (event) => {
    if (event.target === elements.slipDialog) elements.slipDialog.close();
  });

  elements.removeSlip.addEventListener("click", () => {
    elements.slipFile.value = "";
    clearSlipError();
    hideSlipPreview();
    elements.slipFile.focus();
  });

  elements.slipForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearSlipFormMessages();

    const guestName = elements.guestName.value.trim();
    const file = elements.slipFile.files[0];
    let firstInvalidElement = null;

    if (!guestName) {
      elements.guestNameError.textContent = "กรุณากรอกชื่อของคุณ";
      elements.guestName.setAttribute("aria-invalid", "true");
      firstInvalidElement = elements.guestName;
    }

    const slipValidationError = file ? validateSlipFile(file) : "กรุณาเลือกรูปสลิปโอนเงิน";
    if (slipValidationError) {
      elements.slipError.textContent = slipValidationError;
      elements.slipFile.setAttribute("aria-invalid", "true");
      firstInvalidElement ||= elements.slipFile;
    }

    if (firstInvalidElement) {
      firstInvalidElement.focus();
      return;
    }

    if (getValidatedAmount() === null) {
      showSlipFailure("กรุณาตรวจสอบจำนวนเงินก่อนส่งหลักฐาน");
      elements.amount.focus();
      return;
    }

    if (hasSlipEndpoint && !turnstileToken) {
      showSlipFailure("กรุณารอการตรวจสอบความปลอดภัย แล้วลองอีกครั้ง");
      return;
    }

    setSlipSubmitting(true);
    if (hasSlipEndpoint) {
      await submitSlipToEndpoint(guestName, file);
    } else {
      await shareSlip(guestName, file);
    }
    setSlipSubmitting(false);
  });

  elements.guestName.addEventListener("input", () => {
    elements.guestNameError.textContent = "";
    elements.guestName.removeAttribute("aria-invalid");
  });

  function validateSlipFile(file) {
    if (!acceptedSlipTypes.has(file.type)) return "กรุณาเลือกไฟล์รูป JPG, PNG หรือ WebP";
    if (file.size > maximumSlipSize) return "รูปสลิปต้องมีขนาดไม่เกิน 5 MB";
    return "";
  }

  function showSlipPreview(file) {
    hideSlipPreview();
    previewUrl = URL.createObjectURL(file);
    elements.slipPreviewImage.src = previewUrl;
    elements.slipFileName.textContent = file.name;
    elements.slipFileSize.textContent = formatFileSize(file.size);
    elements.slipPreview.hidden = false;
  }

  function hideSlipPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
    elements.slipPreviewImage.removeAttribute("src");
    elements.slipPreview.hidden = true;
  }

  function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(CONFIG.locale)} KB`;
    return `${(bytes / (1024 * 1024)).toLocaleString(CONFIG.locale, { maximumFractionDigits: 1 })} MB`;
  }

  function clearSlipError() {
    elements.slipError.textContent = "";
    elements.slipFile.removeAttribute("aria-invalid");
  }

  function clearSlipFormMessages() {
    elements.guestNameError.textContent = "";
    elements.slipError.textContent = "";
    elements.slipStatus.textContent = "";
    elements.slipStatus.className = "slip-status";
    elements.guestName.removeAttribute("aria-invalid");
    elements.slipFile.removeAttribute("aria-invalid");
  }

  function setSlipSubmitting(isSubmitting) {
    elements.slipSubmit.disabled = isSubmitting;
    elements.slipSubmitLabel.textContent = isSubmitting
      ? "กำลังส่ง…"
      : (hasSlipEndpoint ? "ส่งหลักฐานการโอน" : "แชร์ชื่อและสลิป");
  }

  async function submitSlipToEndpoint(guestName, file) {
    const formData = new FormData();
    formData.append("guestName", guestName);
    formData.append("slip", file, file.name);
    formData.append("amount", elements.amount.value.trim());
    formData.append("eventTitle", CONFIG.heading);
    formData.append("clientSubmissionId", pendingSubmissionId);
    formData.append("turnstileToken", turnstileToken);

    try {
      const response = await fetch(slipSubmissionUrl, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "ส่งหลักฐานไม่สำเร็จ");
      showSlipSuccess(result.message || "ส่งชื่อและสลิปเรียบร้อยแล้ว ขอบพระคุณค่ะ/ครับ");
      resetSlipForm();
      pendingSubmissionId = createSubmissionId();
    } catch (error) {
      showSlipFailure(error.message || "ส่งหลักฐานไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง");
    } finally {
      resetTurnstile();
    }
  }

  function initializeTurnstile() {
    turnstileInitialized = true;
    elements.turnstileContainer.hidden = false;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      turnstileWidgetId = window.turnstile.render(elements.turnstileContainer, {
        sitekey: turnstileSiteKey,
        action: "slip-upload",
        theme: "light",
        size: "flexible",
        callback: (token) => {
          turnstileToken = token;
          if (elements.slipStatus.classList.contains("is-error")) {
            elements.slipStatus.textContent = "";
            elements.slipStatus.className = "slip-status";
          }
        },
        "expired-callback": () => {
          turnstileToken = "";
          showSlipFailure("การตรวจสอบหมดอายุ กรุณารอระบบตรวจสอบอีกครั้ง");
        },
        "error-callback": () => {
          turnstileToken = "";
          showSlipFailure("โหลดระบบตรวจสอบความปลอดภัยไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ");
        }
      });
    });
    script.addEventListener("error", () => {
      turnstileInitialized = false;
      showSlipFailure("โหลดระบบตรวจสอบความปลอดภัยไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต");
    });
    document.head.appendChild(script);
  }

  function resetTurnstile() {
    turnstileToken = "";
    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
  }

  function createSubmissionId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const randomValue = Math.floor(Math.random() * 16);
      const value = character === "x" ? randomValue : ((randomValue & 0x3) | 0x8);
      return value.toString(16);
    });
  }

  async function shareSlip(guestName, file) {
    const amountText = elements.amount.value.trim()
      ? ` จำนวน ${Number(elements.amount.value).toLocaleString(CONFIG.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`
      : "";
    const shareData = {
      title: `สลิปโอนเงินจาก ${guestName}`,
      text: `${guestName} ส่งหลักฐานการโอนสำหรับงาน${CONFIG.heading}${amountText}`,
      files: [file]
    };

    if (!navigator.share || (navigator.canShare && !navigator.canShare({ files: [file] }))) {
      showSlipFailure("อุปกรณ์นี้ไม่รองรับการแชร์ไฟล์ กรุณาเปิดเว็บไซต์บนโทรศัพท์ หรือแจ้งเจ้าภาพเพื่อตั้งค่าระบบรับสลิป");
      return;
    }

    try {
      await navigator.share(shareData);
      showSlipSuccess("เปิดเมนูแชร์แล้ว โปรดตรวจสอบว่าได้ส่งให้เจ้าภาพเรียบร้อย");
    } catch (error) {
      if (error.name !== "AbortError") showSlipFailure("ไม่สามารถเปิดเมนูแชร์ได้ กรุณาลองอีกครั้ง");
    }
  }

  function showSlipSuccess(message) {
    elements.slipStatus.textContent = message;
    elements.slipStatus.className = "slip-status is-success";
  }

  function showSlipFailure(message) {
    elements.slipStatus.textContent = message;
    elements.slipStatus.className = "slip-status is-error";
  }

  function resetSlipForm() {
    elements.slipForm.reset();
    hideSlipPreview();
  }

  async function copyPaymentUrl(successMessage) {
    if (getValidatedAmount() === null) {
      elements.amount.focus();
      return;
    }

    await copyText(
      currentPaymentUrl,
      successMessage,
      "คัดลอกอัตโนมัติไม่ได้ กรุณาเปิดลิงก์แล้วคัดลอกจากเบราว์เซอร์"
    );
  }

  async function copyText(text, successMessage, failureMessage) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
      showToast(successMessage);
    } catch (_error) {
      showToast(failureMessage);
    }
  }

  function fallbackCopy(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand("copy");
    textArea.remove();
    if (!copied) throw new Error("Copy command failed");
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2800);
  }

  if (normalizedPromptPayId.length < 10) {
    elements.qrLoader.classList.add("is-error");
    elements.qrLoader.textContent = "กรุณาตั้งค่า PromptPay ID ในไฟล์ app.js";
    elements.openPayment.setAttribute("aria-disabled", "true");
    elements.copyPromptPayId.disabled = true;
    elements.openPayment.addEventListener("click", (event) => event.preventDefault());
  } else {
    updatePaymentDetails();
  }
})();
