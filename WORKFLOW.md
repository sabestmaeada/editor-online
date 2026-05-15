# Online Editor — Workflow การใช้งาน

เอกสารสำหรับผู้ใช้งาน — อธิบายขั้นตอนทำงานจริงในระบบ

**Version:** v1.0 (May 2026)
**System:** Online Editor — Next.js + Firebase + Cloudflare R2

---

## ภาพรวมระบบ

ระบบสำหรับ **จัดเก็บและแก้ไขไฟล์ HTML ของหนังสือ** พร้อมระบบจัดการทีม

```
[Owner] ─ สร้างโปรเจกต์ ─→ Cloud (R2)
   │
   └─ เชิญ ─→ [Proofreader / Viewer / Editor]
                  └─ Download ─→ ตรวจ / อ่าน
                       └─ ส่ง feedback กลับ
```

---

## 1. บทบาทในระบบ (Roles)

ระบบมี **2 ระดับของ role:**

### 1.1 ระดับระบบ (Global Role)

ติดตัวเสมอ, admin เป็นผู้กำหนด

| Role | ทำอะไรได้ |
|---|---|
| **admin** | จัดการ user, ดู audit log, เข้าทุกโปรเจกต์ |
| **editor** | สร้างโปรเจกต์ใหม่ได้ |
| **writer / reviewer / proofreader / viewer** | เป็น default — รอถูกเชิญเข้าโปรเจกต์ |

### 1.2 ระดับโปรเจกต์ (Project Role)

มีเฉพาะตอนถูกเชิญเข้าโปรเจกต์

| Role | ทำอะไรได้ |
|---|---|
| **Owner** | สร้างเอง = เป็นเจ้าของ, จัดการทุกอย่างในโปรเจกต์ |
| **Editor** (invited) | Download (v1) — v2 จะแก้ไฟล์ได้ |
| **Proofreader** (invited) | Download (v1) — v2 จะ markup ได้ |
| **Viewer** (invited) | Download (v1) — read-only |

> หมายเหตุ: v1 ปัจจุบัน ทุก role ที่ถูกเชิญทำได้เท่ากัน — Download ZIP ไปใช้

---

## 2. เริ่มต้นใช้งานครั้งแรก

### Step 1: สมัครสมาชิก / Login

1. เปิดเว็บ → กด **Sign in**
2. เลือกวิธี:
   - **Email + Password** — ใส่ email + รหัสที่สมัครไว้
   - **Continue with Google** — เร็วสุด ใช้ Google account
3. หลัง login สำเร็จ → ไปหน้า **Dashboard**

### Step 2: ดูข้อมูลตัวเอง

ที่ **Dashboard** จะเห็น:
- ชื่อ + email
- Role ของตัวเอง (default: **viewer**)
- **สีประจำตัว** (สำหรับ Track Changes)

### Step 3: ถ้าต้องการสร้างโปรเจกต์

ต้องให้ admin เปลี่ยน role เป็น **editor** ก่อน (ดูส่วน Admin ด้านล่าง)

---

## 3. บทบาท Admin

### 3.1 จัดการ User (เปลี่ยน role)

1. **Nav bar** → คลิก **Admin** (เห็นเฉพาะ admin)
2. คลิกการ์ด **👥 User Management**
3. หน้า `/admin/users` → ตารางรายชื่อ user ทั้งหมด
4. คอลัมน์ **Role** → dropdown → เปลี่ยนได้ทันที

> ⚠️ ระบบป้องกัน demote admin คนสุดท้าย — admin อย่างน้อย 1 คนต้องอยู่เสมอ

### 3.2 ดู Audit Log

1. **Admin** → การ์ด **📊 Global Audit Log**
2. ดู events ทั้งระบบ — login, logout, project create/update, member invite, ฯลฯ
3. **Filter:**
   - Email — ค้นหาจาก user
   - วันที่ — จาก / ถึง
   - Event type — chips ด้านล่าง
4. **Export CSV** — ดาวน์โหลดเป็น Excel / Numbers สำหรับ audit / report

### 3.3 ดู Login History ของ user รายคน

- `/admin/users` → คลิกชื่อ user
- เห็น login history ทั้งหมด พร้อม IP (truncated), device, country

---

## 4. บทบาท Owner (เจ้าของโปรเจกต์)

### 4.1 สร้างโปรเจกต์ใหม่

**ต้องมี global role = editor หรือ admin**

1. Nav → **Projects** → ปุ่ม **+ New project** (มุมขวาบน)
2. กรอกฟอร์ม:

   | Field | จำเป็น | ตัวอย่าง |
   |---|---|---|
   | Title | ✅ | The Story of Bangkok |
   | Customer | ✅ | ABC Publishing |
   | Pages | ✅ | 240 |
   | Author | — | Jane Doe |
   | Edition | — | 1st |
   | Language | — | th |
   | ISBN | — | 978-... |
   | Description | — | คำอธิบายเพิ่มเติม |

3. **HTML Folder (zipped):**
   - เตรียม folder ที่มีไฟล์ HTML ของหนังสือ
   - **บีบอัดเป็น .zip ก่อน** (Right-click folder → Compress บน macOS)
   - คลิกเลือกไฟล์ .zip
4. กด **Create & Upload** → รอ progress bar เสร็จ
5. เข้าหน้ารายละเอียดของโปรเจกต์ที่สร้างใหม่

### 4.2 เพิ่ม Cover Image

1. หน้าโปรเจกต์ → กด **✎ Edit**
2. ด้านบนของฟอร์ม section **Cover image**
3. คลิก **Upload cover** → เลือกรูป (JPEG/PNG/WebP, max 5MB)
4. รูปจะอัปโหลดและแสดงทันที — ไม่ต้องกด Save

### 4.3 เชิญสมาชิกเข้าโปรเจกต์

1. หน้าโปรเจกต์ → section **Members**
2. ฟอร์ม **Invite member**:
   - **Email** ของผู้ใช้ — ⚠️ ผู้ใช้ต้อง**สมัครในระบบแล้ว**
   - **Role:** Editor / Proofreader / Viewer
3. กด **Invite**
4. รายชื่อ member ปรากฏใน list ด้านล่าง

### 4.4 แก้ Metadata (title / customer / pages / etc.)

1. หน้าโปรเจกต์ → ปุ่ม **✎ Edit** (มุมขวาบน)
2. แก้ค่าใน form → กด **Save changes**
3. กลับมาหน้ารายละเอียดอัตโนมัติ

### 4.5 เปลี่ยน Status ของโปรเจกต์

ที่หน้าโปรเจกต์ → dropdown ข้างชื่อ:

- **draft** — กำลังเตรียม
- **in-progress** — กำลังทำ
- **review** — ส่งให้ proofreader
- **completed** — เสร็จแล้ว
- **archived** — เก็บไว้ ไม่ใช้แล้ว

> เปลี่ยนได้ทันทีจาก dropdown — ไม่ต้องเข้า edit page

### 4.6 แทนไฟล์ทั้งชุด (Replace all files)

ใช้เมื่อแก้ HTML นอกระบบแล้วต้อง sync กลับ

1. หน้าโปรเจกต์ → section **Files** → กล่องสีเหลือง **⚠ Replace all files**
2. เลือก .zip ใหม่ → ระบบจะแจ้งว่าจะลบไฟล์เก่ากี่ไฟล์
3. **Confirm** → ลบของเก่า + อัปโหลดของใหม่
4. หน้าจะ refresh แสดงไฟล์ใหม่

### 4.7 ลบโปรเจกต์ (ระวัง — ทำแล้วย้อนไม่ได้)

1. หน้าโปรเจกต์ → ล่างสุด section **Danger zone**
2. กด **Delete project**
3. **พิมพ์ "DELETE"** เพื่อยืนยัน
4. ระบบลบทั้ง Firestore + ไฟล์ใน R2

---

## 5. บทบาท Member (ถูกเชิญ)

### 5.1 ดูโปรเจกต์ที่ถูกเชิญ

1. Login → Nav → **Projects**
2. เห็น list ของโปรเจกต์ที่:
   - ตัวเองเป็น Owner (สร้างเอง)
   - + ถูกเชิญเข้าร่วม (badge "invited as Proofreader" etc.)

### 5.2 ค้นหา / Filter โปรเจกต์

ฟอร์ม filter ด้านบน list:

- **Search** — title หรือ customer
- **Status** — draft / in-progress / review / ...
- **My role** — Owner / Editor / Proofreader / Viewer

### 5.3 Download ไฟล์โปรเจกต์

1. คลิกโปรเจกต์ → หน้ารายละเอียด
2. ดู metadata + file list (read-only)
3. กดปุ่ม **↓ Download ZIP** (มุมขวาบน)
4. ได้ไฟล์ ZIP ทั้งหมดของโปรเจกต์
5. แตก ZIP บนเครื่อง

---

## 6. การแก้ไขเอกสาร (Book Editor)

### 6.1 เปิด Editor

1. Nav → **Editor** (หรือ Dashboard → **Open Book Editor**)
2. เห็นหน้าจอ editor พร้อม UI ภาษาไทย

### 6.2 เปิดโฟลเดอร์เพื่อแก้ไข

> ⚠️ **ต้องใช้ Chrome / Edge / Brave / Opera** (Chromium browsers) — Safari และ Firefox ไม่รองรับ

1. กดปุ่ม **เปิดโฟลเดอร์** (มุมขวาบน)
2. เลือก folder ของหนังสือบนเครื่อง
3. ไฟล์ HTML แรกจะเปิดอัตโนมัติ
4. โครงสร้างหนังสือแสดงในสารบัญ (sidebar ซ้าย)

### 6.3 แก้ไขเนื้อหา

- คลิกใส่ข้อความ — แก้ได้เลย
- ใช้ **Toolbar** ด้านบน:
  - ตัวหนา / ตัวเอียง / ขีดเส้นใต้
  - หัวข้อ (H1-H4)
  - รายการ (UL / OL) — ตั้งลำดับตัวเลขได้
  - แทรกลิงก์ / รูปภาพ / เส้นคั่น
  - Note Box / สัญลักษณ์จบบท / Code Block

### 6.4 Track Changes (ติดตามการแก้ไข)

1. ใน toolbar → กดไอคอน **ดินสอ** (Track Changes)
2. แถบสีบ่งบอก "เปิดในนาม [ชื่อคุณ]"
3. การแก้ไขทุกครั้งจะมี **สีของคุณ**:
   - **ตัวสีเขียว / ส้ม / ...** — ที่เพิ่มเข้ามา
   - **ตัวขีดฆ่า** — ที่ลบออก
4. **ยอมรับ / ปฏิเสธ** การแก้ไข:
   - **✓ ยอมรับของฉัน** / **✕ ปฏิเสธของฉัน** — เฉพาะของตัวเอง
   - **ยอมรับทั้งหมด** / **ปฏิเสธทั้งหมด** — รวมของคนอื่น (admin/owner)

### 6.5 บันทึก

- ปุ่ม **บันทึก** (มุมขวาบน) — เซฟกลับไฟล์เดิม
- ปุ่ม **บันทึกเป็น** — เซฟเป็นไฟล์ใหม่

### 6.6 ปิดโฟลเดอร์

- กด **ปิดโฟลเดอร์** → ถ้ามี unsaved changes ระบบจะถามก่อน

### 6.7 กลับ Dashboard

- กด **← ลูกศรย้อนกลับ** มุมซ้ายบน → ไปหน้า Dashboard

---

## 7. Workflow รวม (Owner ↔ Proofreader)

### Owner

1. สร้างโปรเจกต์ + upload ZIP
2. เพิ่ม Cover
3. เชิญ proofreader
4. เปลี่ยน status → "review"

### Proofreader

5. Login → /projects → เห็นโปรเจกต์ที่ถูกเชิญ
6. Download ZIP
7. แตก ZIP บนเครื่อง
8. เปิด /editor → เปิดโฟลเดอร์ที่แตก
9. **เปิด Track Changes** → markup
10. บันทึก → ZIP กลับ (จากเครื่อง)
11. ส่ง ZIP กลับให้ Owner (ทาง email/chat)

### Owner (ต่อ)

12. /projects/{id} → **Replace all files**
13. Upload ZIP จาก proofreader
14. เปิด /editor → ดู changes → ยอมรับ / ปฏิเสธ
15. เปลี่ยน status → "completed"

---

## 8. ข้อจำกัด & เคล็ดลับ

### ข้อจำกัด

1. **Browser:** Editor ต้องใช้ Chromium-based (Chrome / Edge / Brave / Opera) เท่านั้น
2. **ZIP upload:** สูงสุด ~100MB (ขึ้นกับ plan ของ Vercel)
3. **Cover image:** สูงสุด 5MB · JPEG / PNG / WebP
4. **Invite:** ผู้ถูกเชิญต้อง register ในระบบก่อน (ใช้ email หา)
5. **Editor ในระบบยังไม่เชื่อมกับ project ใน Cloud** — ต้อง Download → แก้ local → Replace ZIP

### เคล็ดลับ

- ✅ **เปิด Track Changes ก่อนแก้** — จะรู้ว่าใครแก้อะไร
- ✅ **เลือกสีของตัวเองให้แยกได้ง่าย** — กดที่ user badge → เปลี่ยนสี
- ✅ **Save บ่อยๆ** — ระบบเตือนถ้าจะปิดทั้งที่ยังไม่ save
- ✅ **ใช้ status workflow** — draft → in-progress → review → completed
- ⚠️ **Logout เมื่อใช้เครื่องร่วม** — ป้องกัน session ค้าง

---

## 9. Troubleshooting

| ปัญหา | วิธีแก้ |
|---|---|
| Login แล้วไม่เข้าระบบ | Clear cookies → ลอง login ใหม่ |
| กด "เปิดโฟลเดอร์" ไม่ขึ้น dialog | ตรวจ browser permission ที่ไอคอนกุญแจข้าง URL → File System → Ask |
| Upload ZIP fail | ตรวจขนาดไฟล์ (~100MB max) |
| ลืม password | (admin reset ผ่าน Firebase Console) |
| Track Changes ไม่ขึ้นสี | กด **🎨** ที่ user badge → เลือกสี → Save |
| Replace files แล้วหายหมด | ตรวจ ZIP — มีไฟล์อย่างน้อย index.html อยู่ใน root |

---

## 10. ติดต่อ Admin

สำหรับขอเปลี่ยน role / เพิ่มสิทธิ์ / report bug:

- ติดต่อ admin ของระบบ
