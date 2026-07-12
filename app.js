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
  addressLine1: "บ้านเลขที่ [กรอกบ้านเลขที่] ตำบล [กรอกชื่อตำบล]",
  addressLine2: "อำเภอ [กรอกชื่ออำเภอ] จังหวัด [กรอกชื่อจังหวัด]",
  latitude: 15.435534,
  longitude: 103.648366,

  // IMPORTANT: Replace this sample PromptPay ID before deployment.
  // This value will be visible in the public source code and QR image URL.
  promptPayId: "1103100275320",

  promptPayRecipient: "นายพิมล ตุ่นกระโทก",
  defaultAmount: "500",
  currency: "THB",
  locale: "th-TH"
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
    toast: document.querySelector("#toast")
  };

  let currentPaymentUrl = "";
  let updateTimer;
  let toastTimer;

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
