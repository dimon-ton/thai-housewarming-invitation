# ตั้งค่า Supabase และ Google Drive สำหรับรับสลิป

ระบบนี้ใช้ Supabase Edge Function รับข้อมูลจากหน้าเว็บ ตรวจสอบ Cloudflare Turnstile อัปโหลดรูปไปยัง Google Drive แบบ private และบันทึกเฉพาะชื่อ จำนวนเงิน และ Drive file ID ลง Supabase

อย่าใส่ Google client secret, refresh token, Turnstile secret หรือ Supabase secret key ใน `app.js` หรือ GitHub

## สิ่งที่ต้องมี

- บัญชี Supabase
- บัญชี Google ที่เป็นเจ้าของโฟลเดอร์รับสลิป
- บัญชี Cloudflare สำหรับ Turnstile (ไม่จำเป็นต้องย้าย DNS เว็บไซต์ไป Cloudflare)
- Node.js 20 ขึ้นไป (`node --version`)

ไม่จำเป็นต้องติดตั้ง Docker สำหรับขั้นตอน deploy ด้านล่าง

## 1. สร้าง Supabase project

1. เปิด <https://database.new> และเข้าสู่ระบบ
2. กด **New project**
3. ตั้งชื่อ เช่น `new-home-merit`
4. สร้างและเก็บ Database Password ไว้ใน password manager
5. รอ project สร้างเสร็จ
6. เปิด **Project Settings → General** แล้วคัดลอก **Reference ID**

ใน PowerShell ที่โฟลเดอร์โปรเจกต์นี้ รัน:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

ตอบ Database Password เมื่อระบบถาม คำสั่ง `db push` จะสร้าง:

- `payment_submissions` สำหรับข้อมูลผู้โอนและ Drive file ID
- `slip_upload_attempts` สำหรับ rate limiting
- RLS และสิทธิ์ที่ป้องกันไม่ให้ผู้ใช้ทั่วไปอ่านข้อมูล

ตรวจสอบได้ที่ **Supabase Dashboard → Table Editor → payment_submissions**

## 2. เปิด Google Drive API

1. เปิด <https://console.cloud.google.com/>
2. สร้าง Google Cloud project เช่น `Housewarming Slip Upload`
3. เปิด **APIs & Services → Library**
4. ค้นหา **Google Drive API** แล้วกด **Enable**
5. เปิด **Google Auth Platform → Branding** แล้วกรอกชื่อแอปและอีเมล
6. ตั้ง Audience เป็น **External** และเพิ่ม Google account ของคุณเป็น test user หากระบบถาม
7. เพิ่ม scope นี้ใน **Data Access**:

```text
https://www.googleapis.com/auth/drive.file
```

scope `drive.file` ให้ระบบจัดการเฉพาะไฟล์ที่แอปสร้าง ไม่เปิดสิทธิ์อ่านไฟล์อื่นทั้งหมดใน Drive

## 3. สร้าง Google OAuth credentials

1. ใน Google Cloud เปิด **Google Auth Platform → Clients**
2. กด **Create client → Web application**
3. ตั้งชื่อ `Supabase Slip Uploader`
4. เพิ่ม Authorized redirect URI:

```text
https://developers.google.com/oauthplayground
```

5. กด Create แล้วเก็บ **Client ID** และ **Client secret** ไว้ ห้าม commit ลง Git

## 4. สร้าง refresh token และโฟลเดอร์ Drive

1. เปิด [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. กดรูปเฟืองมุมขวาบน
3. เปิด **Use your own OAuth credentials**
4. ใส่ Client ID และ Client secret จากขั้นตอนก่อนหน้า
5. ตั้ง Access type เป็น **Offline** และ Force prompt เป็น **Consent Screen**
6. ใน Step 1 ใส่ scope:

```text
https://www.googleapis.com/auth/drive.file
```

7. กด **Authorize APIs** และเลือก Google account ที่จะเก็บสลิป
8. ใน Step 2 กด **Exchange authorization code for tokens**
9. คัดลอก **Refresh token** เก็บไว้เป็นความลับ

จากนั้นสร้างโฟลเดอร์ที่ OAuth app สามารถเข้าถึงได้:

1. ไป Step 3 ของ OAuth Playground
2. Method: `POST`
3. Request URI:

```text
https://www.googleapis.com/drive/v3/files
```

4. Content-Type: `application/json`
5. Request body:

```json
{
  "name": "Housewarming Slips",
  "mimeType": "application/vnd.google-apps.folder"
}
```

6. กด **Send the request**
7. คัดลอกค่า `id` จาก response นี่คือ `GOOGLE_DRIVE_FOLDER_ID`
8. เปิด Google Drive เพื่อตรวจสอบว่าเห็นโฟลเดอร์ `Housewarming Slips`

ก่อนใช้งานจริง ให้เปลี่ยน OAuth app จาก **Testing** เป็น **In production** เพราะ refresh token ของ External app ที่อยู่ในสถานะ Testing อาจหมดอายุภายใน 7 วัน

## 5. สร้าง Cloudflare Turnstile

1. เปิด <https://dash.cloudflare.com/> แล้วเลือก **Turnstile**
2. กด **Add widget**
3. ตั้งชื่อ `Housewarming Slip Form`
4. เพิ่ม hostname ของ GitHub Pages เช่น:

```text
dimon-ton.github.io
```

ใส่เฉพาะ hostname ไม่ต้องใส่ `https://` หรือ path ของ repository

5. เลือก Managed widget แล้วกด Create
6. เก็บ **Site key** และ **Secret key** แยกกัน

Site key เป็นข้อมูล public และใส่ใน `app.js` ได้ ส่วน Secret key ต้องอยู่ใน Supabase secrets เท่านั้น

## 6. ตั้งค่า Supabase Edge Function secrets

สร้าง salt แบบสุ่มใน PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToHexString($bytes)
```

ตั้ง secrets โดยแทนค่าตัวอย่างทั้งหมดด้วยค่าจริง:

```powershell
npx supabase secrets set "ALLOWED_ORIGINS=https://dimon-ton.github.io" "TURNSTILE_EXPECTED_HOSTNAME=dimon-ton.github.io" "TURNSTILE_SECRET_KEY=YOUR_TURNSTILE_SECRET" "IP_HASH_SALT=YOUR_RANDOM_SALT" "GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET" "GOOGLE_REFRESH_TOKEN=YOUR_GOOGLE_REFRESH_TOKEN" "GOOGLE_DRIVE_FOLDER_ID=YOUR_DRIVE_FOLDER_ID"
```

หากใช้ custom domain ให้แทน `dimon-ton.github.io` ด้วย hostname จริง หากต้องรองรับหลาย origin ให้คั่น `ALLOWED_ORIGINS` ด้วย comma

ตรวจสอบเฉพาะรายชื่อ secrets โดยไม่แสดงค่าจริง:

```powershell
npx supabase secrets list
```

## 7. Deploy Edge Function

```powershell
npx supabase functions deploy submit-slip --use-api
```

Function URL จะเป็น:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/submit-slip
```

ไฟล์ `supabase/config.toml` ตั้ง `verify_jwt = false` เพราะแขกไม่ได้เข้าสู่ระบบ แต่ endpoint ยังป้องกันด้วย allowed origin, Turnstile, rate limit และ server-side validation

## 8. เชื่อมหน้าเว็บ

เปิด `app.js` แล้วตั้งค่าสองค่านี้:

```js
slipSubmissionUrl: "https://YOUR_PROJECT_REF.supabase.co/functions/v1/submit-slip",
turnstileSiteKey: "YOUR_TURNSTILE_SITE_KEY"
```

ห้ามนำ Turnstile secret หรือ Google credentials มาใส่ในไฟล์นี้

commit และ push ขึ้น GitHub Pages:

```powershell
git add .
git commit -m "feat: add secure slip upload backend"
git push origin main
```

## 9. ทดสอบ production

1. เปิดเว็บไซต์ GitHub Pages บนโทรศัพท์
2. กรอกชื่อและจำนวนเงิน
3. เลือกรูป JPG, PNG หรือ WebP ที่เล็กกว่า 5 MB
4. รอ Turnstile ตรวจสอบ แล้วกดส่ง
5. ตรวจสอบรูปใน Google Drive → `Housewarming Slips`
6. ตรวจสอบแถวใหม่ใน Supabase → Table Editor → `payment_submissions`
7. ตรวจสอบว่ารูป Drive ยังเป็น private

หากมีปัญหา ให้เปิด **Supabase Dashboard → Edge Functions → submit-slip → Logs** ข้อความ log จะไม่บันทึกชื่อผู้โอนหรือเนื้อหารูป

## ดูและยืนยันสลิป

ในระยะแรกให้ใช้ Supabase Table Editor เปลี่ยน `status`:

- `received` — ได้รับแล้ว รอตรวจสอบ
- `verified` — ตรวจสอบแล้ว
- `rejected` — ไม่ผ่านการตรวจสอบ

Drive file ID ในคอลัมน์ `drive_file_id` เปิดได้ด้วย URL รูปแบบนี้หลังจากล็อกอินบัญชีเจ้าของ Drive:

```text
https://drive.google.com/open?id=DRIVE_FILE_ID
```
