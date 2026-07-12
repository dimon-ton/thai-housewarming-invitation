# คำเชิญพิธีทำบุญขึ้นบ้านใหม่

เว็บไซต์คำเชิญแบบหน้าเดียวสำหรับ GitHub Pages สร้างด้วย HTML, CSS และ JavaScript ล้วน รองรับมือถือ แผนที่ Google Maps และ PromptPay QR Code จาก PromptPay.io

## ตั้งค่าก่อนเผยแพร่

เปิด `app.js` แล้วแก้ไขออบเจ็กต์ `CONFIG` ที่อยู่บนสุดของไฟล์ โดยเฉพาะ:

- `addressLine1` และ `addressLine2` — ที่อยู่จริงของสถานที่จัดงาน
- `latitude` และ `longitude` — พิกัดจริงสำหรับปุ่มนำทาง
- `promptPayId` — เบอร์โทรศัพท์ เลขประจำตัวประชาชน หรือเลข e-Wallet ที่ผูก PromptPay
- `promptPayRecipient` — ชื่อผู้รับที่ผู้ร่วมงานควรเห็นในแอปธนาคาร
- วัน เวลา ชื่อเจ้าภาพ และข้อความเชิญ

> **สำคัญ:** `promptPayId` เป็นข้อมูลสาธารณะ เพราะอยู่ใน source code และ URL รูป QR Code โปรดตรวจสอบชื่อผู้รับและทดลองสแกนด้วยแอปธนาคารก่อนเผยแพร่จริง

PromptPay URL มีรูปแบบ:

```text
https://promptpay.io/PROMPTPAY_ID.png
https://promptpay.io/PROMPTPAY_ID/AMOUNT.png
```

จำนวนเงินไม่บังคับ ผู้เข้าชมสามารถระบุจำนวนเงินเพื่อสร้าง QR ใหม่ เปิดรูป QR ในแท็บใหม่ แชร์ผ่านเมนูแชร์ของมือถือ หรือคัดลอกลิงก์ได้
ผู้เข้าชมยังสามารถกดปุ่ม **คัดลอกเลข PromptPay** เพื่อนำเบอร์โทรศัพท์หรือเลขบัตรประชาชนไปวางในแอปธนาคารโดยตรง

## เปิดในเครื่อง

เปิด `index.html` โดยตรง หรือเปิด static server จากโฟลเดอร์นี้ เช่น:

```powershell
python -m http.server 8080
```

แล้วเข้าที่ `http://localhost:8080/`

QR Code ต้องใช้อินเทอร์เน็ตเพื่อโหลดรูปจาก PromptPay.io ส่วนเว็บไซต์ไม่มี build step และไม่มี dependency

## เผยแพร่บน GitHub Pages

1. สร้าง repository และอัปโหลดไฟล์ทั้งหมดไว้ที่ root ของ repository
2. ไปที่ **Settings → Pages**
3. เลือก **Deploy from a branch** จากนั้นเลือก branch `main` และโฟลเดอร์ `/ (root)`
4. เปิด URL ที่ GitHub แสดง เช่น `https://username.github.io/repository-name/`

ทุก asset ใช้ relative path จึงทำงานภายใต้ repository subdirectory ได้

## ไฟล์ในโปรเจกต์

- `index.html` — โครงสร้างหน้าและ inline SVG ตกแต่ง
- `styles.css` — ธีม responsive และลายกระดาษสีน้ำ
- `app.js` — ข้อมูลกลางและการทำงาน Maps/PromptPay
- `favicon.svg` — ไอคอนเว็บไซต์แบบ SVG
- `assets/home.png` — ภาพบ้านที่แสดงก่อนส่วนสถานที่จัดงาน

หากภายหลังเพิ่ม `assets/reference-invitation.png` ไฟล์ดังกล่าวใช้เป็นงานอ้างอิงเท่านั้นและไม่ถูกโหลดขึ้นหน้าเว็บ
