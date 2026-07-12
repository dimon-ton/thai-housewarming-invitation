const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") || "";
  const allowedOrigins = requireEnvironment("ALLOWED_ORIGINS")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const originIsAllowed = allowedOrigins.includes(origin.replace(/\/$/, ""));
  const corsHeaders = {
    "Access-Control-Allow-Origin": originIsAllowed ? origin : allowedOrigins[0],
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  if (request.method === "OPTIONS") {
    return originIsAllowed
      ? new Response(null, { status: 204, headers: corsHeaders })
      : jsonResponse({ message: "Origin not allowed" }, 403, corsHeaders);
  }

  if (!originIsAllowed) {
    return jsonResponse({ message: "ไม่อนุญาตให้ส่งข้อมูลจากเว็บไซต์นี้" }, 403, corsHeaders);
  }

  if (request.method !== "POST") {
    return jsonResponse({ message: "Method not allowed" }, 405, corsHeaders);
  }

  let driveFileId = "";

  try {
    const formData = await request.formData();
    const guestName = normalizeText(formData.get("guestName"), 100, "กรุณากรอกชื่อของคุณ");
    const eventTitle = optionalText(formData.get("eventTitle"), 200);
    const amount = validateAmount(formData.get("amount"));
    const clientSubmissionId = String(formData.get("clientSubmissionId") || "").trim();
    const turnstileToken = String(formData.get("turnstileToken") || "").trim();
    const slip = formData.get("slip");

    if (!UUID_PATTERN.test(clientSubmissionId)) {
      throw new HttpError(400, "รหัสการส่งข้อมูลไม่ถูกต้อง กรุณารีเฟรชหน้าเว็บ");
    }
    if (!(slip instanceof File)) {
      throw new HttpError(400, "กรุณาเลือกรูปสลิปโอนเงิน");
    }
    await validateSlip(slip);

    const ipAddress = getClientIp(request);
    await verifyTurnstile(turnstileToken, ipAddress, clientSubmissionId);

    const existingSubmission = await findSubmission(clientSubmissionId);
    if (existingSubmission) {
      return jsonResponse({
        submissionId: existingSubmission.id,
        status: existingSubmission.status,
        message: "ระบบได้รับหลักฐานนี้เรียบร้อยแล้ว",
      }, 200, corsHeaders);
    }

    const ipHash = await hashIpAddress(ipAddress);
    const allowedByRateLimit = await consumeRateLimit(ipHash);
    if (!allowedByRateLimit) {
      throw new HttpError(429, "ส่งข้อมูลหลายครั้งเกินไป กรุณารอ 10 นาทีแล้วลองใหม่");
    }

    const googleAccessToken = await getGoogleAccessToken();
    const driveFile = await uploadSlipToDrive(slip, clientSubmissionId, googleAccessToken);
    driveFileId = driveFile.id;

    const submission = await insertSubmission({
      client_submission_id: clientSubmissionId,
      guest_name: guestName,
      amount,
      drive_file_id: driveFile.id,
      original_filename: slip.name.slice(0, 255) || `slip.${extensionForMimeType(slip.type)}`,
      mime_type: slip.type,
      file_size: slip.size,
      event_title: eventTitle,
    });

    return jsonResponse({
      submissionId: submission.id,
      status: submission.status,
      message: "ส่งชื่อและสลิปเรียบร้อยแล้ว ขอบพระคุณค่ะ/ครับ",
    }, 201, corsHeaders);
  } catch (error) {
    if (driveFileId) {
      try {
        const accessToken = await getGoogleAccessToken();
        await deleteDriveFile(driveFileId, accessToken);
      } catch (cleanupError) {
        console.error("Failed to remove orphaned Drive file", driveFileId, cleanupError);
      }
    }

    if (error instanceof HttpError) {
      return jsonResponse({ message: error.message }, error.status, corsHeaders);
    }

    console.error("Unexpected slip submission error", error);
    return jsonResponse({ message: "ระบบไม่สามารถรับสลิปได้ในขณะนี้ กรุณาลองอีกครั้ง" }, 500, corsHeaders);
  }
});

function requireEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function normalizeText(value: FormDataEntryValue | null, maximumLength: number, message: string): string {
  const normalized = String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > maximumLength) throw new HttpError(400, message);
  return normalized;
}

function optionalText(value: FormDataEntryValue | null, maximumLength: number): string | null {
  const normalized = String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length > maximumLength) throw new HttpError(400, "ข้อมูลกิจกรรมยาวเกินไป");
  return normalized;
}

function validateAmount(value: FormDataEntryValue | null): string | null {
  const rawAmount = String(value || "").trim();
  if (!rawAmount) return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(rawAmount)) throw new HttpError(400, "จำนวนเงินไม่ถูกต้อง");
  const amount = Number(rawAmount);
  if (amount < 0.01 || amount > 999999.99) throw new HttpError(400, "จำนวนเงินไม่ถูกต้อง");
  return amount.toFixed(2);
}

async function validateSlip(file: File): Promise<void> {
  if (!ALLOWED_MIME_TYPES.has(file.type)) throw new HttpError(400, "กรุณาเลือกไฟล์ JPG, PNG หรือ WebP");
  if (file.size < 1 || file.size > MAX_FILE_SIZE) throw new HttpError(400, "รูปสลิปต้องมีขนาดไม่เกิน 5 MB");

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isJpeg = file.type === "image/jpeg" && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const isPng = file.type === "image/png" && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    .every((byte, index) => header[index] === byte);
  const isWebp = file.type === "image/webp"
    && ascii(header.slice(0, 4)) === "RIFF"
    && ascii(header.slice(8, 12)) === "WEBP";

  if (!isJpeg && !isPng && !isWebp) throw new HttpError(400, "ไฟล์ที่เลือกไม่ใช่รูปภาพที่รองรับ");
}

function ascii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function getClientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || "unknown";
}

async function verifyTurnstile(token: string, ipAddress: string, idempotencyKey: string): Promise<void> {
  if (!token) throw new HttpError(400, "กรุณารอการตรวจสอบความปลอดภัยแล้วลองอีกครั้ง");

  const body = new URLSearchParams({
    secret: requireEnvironment("TURNSTILE_SECRET_KEY"),
    response: token,
    remoteip: ipAddress,
    idempotency_key: idempotencyKey,
  });
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new HttpError(503, "ตรวจสอบความปลอดภัยไม่สำเร็จ กรุณาลองอีกครั้ง");

  const result = await response.json() as { success?: boolean; action?: string; hostname?: string };
  const expectedHostname = Deno.env.get("TURNSTILE_EXPECTED_HOSTNAME")?.trim();
  if (!result.success || result.action !== "slip-upload" || (expectedHostname && result.hostname !== expectedHostname)) {
    throw new HttpError(403, "การตรวจสอบความปลอดภัยไม่ผ่าน กรุณาลองอีกครั้ง");
  }
}

async function hashIpAddress(ipAddress: string): Promise<string> {
  const salt = requireEnvironment("IP_HASH_SALT");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ipAddress}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function supabaseHeaders(prefer?: string): HeadersInit {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY");
  if (!serviceKey) throw new Error("Missing Supabase service role/secret key");
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function consumeRateLimit(ipHash: string): Promise<boolean> {
  const response = await fetch(`${requireEnvironment("SUPABASE_URL")}/rest/v1/rpc/consume_slip_rate_limit`, {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify({ p_ip_hash: ipHash }),
  });
  if (!response.ok) throw new Error(`Rate-limit RPC failed: ${response.status}`);
  return await response.json() as boolean;
}

async function findSubmission(clientSubmissionId: string): Promise<{ id: string; status: string } | null> {
  const query = new URLSearchParams({
    client_submission_id: `eq.${clientSubmissionId}`,
    select: "id,status",
    limit: "1",
  });
  const response = await fetch(`${requireEnvironment("SUPABASE_URL")}/rest/v1/payment_submissions?${query}`, {
    headers: supabaseHeaders(),
  });
  if (!response.ok) throw new Error(`Submission lookup failed: ${response.status}`);
  const rows = await response.json() as Array<{ id: string; status: string }>;
  return rows[0] || null;
}

async function insertSubmission(values: JsonRecord): Promise<{ id: string; status: string }> {
  const response = await fetch(`${requireEnvironment("SUPABASE_URL")}/rest/v1/payment_submissions?select=id,status`, {
    method: "POST",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify(values),
  });
  if (!response.ok) throw new Error(`Database insert failed: ${response.status}`);
  const rows = await response.json() as Array<{ id: string; status: string }>;
  if (!rows[0]) throw new Error("Database insert returned no row");
  return rows[0];
}

async function getGoogleAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: requireEnvironment("GOOGLE_CLIENT_ID"),
    client_secret: requireEnvironment("GOOGLE_CLIENT_SECRET"),
    refresh_token: requireEnvironment("GOOGLE_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Google token request failed: ${response.status}`);
  const result = await response.json() as { access_token?: string };
  if (!result.access_token) throw new Error("Google token response did not contain an access token");
  return result.access_token;
}

async function uploadSlipToDrive(file: File, submissionId: string, accessToken: string): Promise<{ id: string }> {
  const boundary = `slip_${crypto.randomUUID().replaceAll("-", "")}`;
  const extension = extensionForMimeType(file.type);
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const metadata = {
    name: `${timestamp}_${submissionId}.${extension}`,
    parents: [requireEnvironment("GOOGLE_DRIVE_FOLDER_ID")],
    appProperties: { submission_id: submissionId, source: "housewarming-site" },
  };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`,
    await file.arrayBuffer(),
    `\r\n--${boundary}--`,
  ]);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!response.ok) throw new Error(`Google Drive upload failed: ${response.status}`);
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error("Google Drive did not return a file ID");
  return { id: result.id };
}

async function deleteDriveFile(fileId: string, accessToken: string): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok && response.status !== 404) throw new Error(`Drive cleanup failed: ${response.status}`);
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function jsonResponse(body: JsonRecord, status: number, headers: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
