# Annotation markup contract — โครงสร้าง HTML/คลาสที่ editor เซฟ

> **แหล่งความจริงเดียว (single source of truth)** สำหรับ markup ของ annotation บนรูป
> (ตัวชี้ / เส้นชี้ / กรอบ / กล่องข้อความ) ที่เว็บ editor (`public/book-editor/`) สร้างและเซฟ
>
> ทุก repo ที่ **อ่าน / render / แปลง** annotation ต้องยึดไฟล์นี้:
> - **weasyprint-book** (print-book) — render เป็น PDF
> - **image-annotator** skill — generate markup ชุดเดียวกัน (ต้องตรงกับที่นี่)
> - renderer/ตัวแปลงอื่น ๆ ในอนาคต
>
> อยู่คู่กับโค้ดที่ผลิต (`editor.js`) เพื่อให้ sync กันเสมอ — แก้ editor แล้วอัปเดตไฟล์นี้ด้วย

---

## 1. โครงสร้างเต็ม

```html
<figure class="book-img">
  <span class="img-frame msize-3">         <!-- กรอบอ้างอิง position:relative; inline-block; contenteditable=false -->
    <img src="./images/x.png" alt="…">      <!-- (อาจมี data-crop ถ้า crop — ดู §6) -->

    <svg class="img-lines" viewBox="0 0 100 H" preserveAspectRatio="none" data-h="H">
      <g class="img-line" data-type="straight" data-cap1="none" data-cap2="arrow"
         data-color="#E5534B" data-w="0.6" data-cs="1.5" data-bow="0" data-halo="0.8"
         data-x1="22" data-y1="15" data-x2="58" data-y2="37">
        <path class="img-line-hit"  d="…" fill="none" stroke="transparent" stroke-width="3.4"></path>
        <path class="img-line-halo" d="…" fill="none" stroke="#ffffff" stroke-width="…" stroke-linecap="round" stroke-linejoin="round"></path>
        <path class="img-line-main" d="…" fill="none" stroke="#E5534B" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"></path>
        <!-- cap: dot=<circle> / arrow=<path> (barbed) — fill=สีเส้น -->
        <circle class="img-line-cap" cx="…" cy="…" r="…" fill="#E5534B" stroke="#ffffff" stroke-width="…"></circle>
      </g>
    </svg>

    <span class="img-markers">              <!-- ชั้น HTML: วาง "หลัง" svg → ตัวเลขอยู่หน้าเส้น -->
      <span class="img-marker" data-n="1" style="left:22%; top:15%;">1</span>
      <span class="img-rect rounded" style="left:48%; top:34%; width:18%; height:16%; border-color:#1A73E8; border-width:2px;"></span>
      <div  class="img-textbox" style="left:4%; top:12%; width:24%; border-color:#1A73E8; border-radius:8px;">ข้อความ</div>
    </span>
  </span>
  <figcaption>…</figcaption>           <!-- ไม่บังคับ (P2-S112: ปิดเป็นค่าเริ่มต้น) -->
</figure>
```

**ลำดับลูกใน `.img-frame` สำคัญ:** `img` → `svg.img-lines` → `span.img-markers`
(เส้นอยู่ใต้ตัวเลข เพื่อให้ตัวเลขทับปลายเส้นได้)

---

## 2. ตารางคลาส (ทุกคลาส + element + บทบาท)

| คลาส | element | บทบาท |
|---|---|---|
| `.book-img` | `<figure>` | บล็อกรูปทั้งก้อน (มีอยู่เดิม) |
| `.img-frame` | `<span>` | กรอบอ้างอิงพิกัด `position:relative; display:inline-block` · `+ .msize-1..4` (ขนาดตัวชี้, ไม่มี = 3) |
| `.img-markers` | `<span>` | ชั้น overlay ของ marker/rect/textbox (`position:absolute; inset:0; pointer-events:none`) |
| `.img-marker` | `<span>` | ตัวชี้ตัวเลข · `data-n="N"` = เลขของมัน · พิกัด `left/top` % (จุดอ้างอิง = กึ่งกลางวงกลม ชดเชยด้วย margin) |
| `.img-rect` | `<span>` | กรอบเน้น · `+ .rounded` = มุมมน · `left/top/width/height` % |
| `.img-textbox` | `<div>` | กล่องข้อความ callout · `contenteditable="false"` ตอน idle · `left/top/width` % (จุดอ้างอิง = ขอบบนซ้าย) |
| `.img-lines` | `<svg>` | ชั้นเส้น · `viewBox="0 0 100 H"` + `preserveAspectRatio="none"` + `data-h="H"` |
| `.img-line` | `<g>` | เส้น 1 เส้น (เก็บสถานะใน `data-*` ดู §6) |
| `.img-line-hit` | `<path>` | โซนคลิก (มองไม่เห็น) · `fill="none" stroke="transparent"` |
| `.img-line-halo` | `<path>` | ขอบขาวใต้เส้น · `fill="none" stroke="#ffffff"` |
| `.img-line-main` | `<path>` | เส้นจริง · `fill="none" stroke="<สี>"` |
| `.img-line-cap` | `<circle>`/`<path>` | ปลายเส้น: จุด (circle) หรือ หัวลูกศร barbed (path) · `fill="<สี>"` |

---

## 3. โมเดลพิกัด (ทุกอย่างเป็น %)

- **marker / rect / textbox**: `left/top[/width/height]` = **% ของกรอบ `.img-frame`** (= กล่องรูปที่เห็น)
- **เส้น SVG**: แกน x = 0–100, แกน y = 0–`H` โดย **`H = round(100 × สูงกรอบ ÷ กว้างกรอบ)`** · พิกัด y ของจุด = `(top% ÷ 100) × H`
- `preserveAspectRatio="none"` + svg `width/height:100%` → ยืดกริด 100×H เต็มกรอบ → scale X=Y เท่ากัน → วงกลม cap กลม เส้นไม่เอียง
- **ทุกพิกัดเป็น % → ขยาย/ย่อ/พิมพ์ PDF ไม่เพี้ยน** (ไม่ผูก px)
- รูปที่ถูก crop: พิกัดอ้าง "กรอบที่เห็น" ไม่ใช่ไฟล์เต็ม (ดู §6 + `data-crop`)

---

## 4. ⭐ กฎทอง: attribute ไหนต้อง inline (ห้ามพึ่ง CSS)

**PDF renderer (WeasyPrint ฯลฯ) ไม่อ่าน CSS สำหรับ paint/เรขาคณิตของ SVG และ overlay** → ค่าต่อไปนี้ editor เขียน **inline เสมอ** และ consumer ต้องคงไว้:

| ต้อง inline | บนอะไร | ถ้าขาด |
|---|---|---|
| `fill` + `stroke` | ทุก `<path>`/`<circle>` ในเส้น | SVG default `fill="black"` → เส้นโค้ง/มุมเป็นพื้นดำใน PDF |
| `stroke-width`, `stroke-linecap/linejoin` | path ของเส้น | เส้นหนา/ปลายผิด |
| `left/top/width/height` (%) | marker/rect/textbox (ใน `style`) | วางผิดตำแหน่ง |
| `border-color/border-width` | rect/textbox (ต่อชิ้น) | สีกรอบผิด |
| `viewBox` + `preserveAspectRatio="none"` + `data-h` | `<svg class="img-lines">` | เส้นยืด/เพี้ยน |
| `data-crop` | `<img>` ที่ crop | (สำหรับสกิล remap — PDF ไม่ใช้ ดู §6) |

> CSS ในเทมเพลตหนังสือเป็นแค่ค่าตั้งต้น/แบ็กอัป — **อย่าพึ่ง CSS เพื่อกำหนดสี/ตำแหน่ง**

---

## 5. สิ่งที่ editor "ตัดออกตอนเซฟ" (consumer ไม่มีวันเห็น)

editor ทำความสะอาดก่อนเซฟ → markup ที่ repo อื่นรับมา**สะอาดเสมอ**:
- ❌ `.img-line-handle` (จุดลากแก้เส้น) — ลบทิ้ง
- ❌ คลาสสถานะ `.selected / .dragging / .drawing / .editing` — ถอด
- ❌ `contenteditable="true"` บน textbox — บังคับเป็น `false`
- ❌ `data-next-n` บน `.img-frame` (ตัวนับเลขถัดไป) — ลบทิ้ง

→ consumer ไม่ต้องจัดการสถานะแก้ไขใด ๆ

---

## 6. data-* attributes (อ้างอิง)

| attribute | บน | ความหมาย |
|---|---|---|
| `data-n` | `.img-marker` | เลขที่แสดงของตัวชี้ |
| `msize-1..4` (class) | `.img-frame` | ขนาดตัวชี้ (เส้นผ่าศก. 18/24/30/38 px · ไม่มี = 3) |
| `data-h` | `svg.img-lines` | ความสูง viewBox = `round(100 × สูงกรอบ/กว้างกรอบ)` |
| `data-type` | `g.img-line` | `straight` / `elbow45` / `elbow90` / `curved` |
| `data-cap1` / `data-cap2` | `g.img-line` | ปลายสองข้าง: `none` / `dot` / `arrow` |
| `data-color` | `g.img-line` | สีเส้น |
| `data-w` / `data-cs` / `data-bow` / `data-halo` | `g.img-line` | ความหนาเส้น / ขนาด cap / ความโค้ง / ความหนา halo |
| `data-x1/y1/x2/y2` | `g.img-line` | พิกัดปลายเส้น (หน่วย viewBox) — ใช้ render เส้นใหม่ |
| **`data-crop`** | `<img>` | `cropX,cropY,cropW,cropH` (% ของไฟล์เต็ม) — มี = รูปถูก crop · **สำหรับสกิล image-annotator remap พิกัดเท่านั้น, PDF ไม่ต้องอ่าน** · รายละเอียด: `image-annotator/references/crop-support.md` |

---

## 7. Invariant ที่ห้ามแตะ

1. **ลำดับลูก** `img → svg.img-lines → span.img-markers` (ไม่งั้นตัวเลขโดนเส้นบัง)
2. **`preserveAspectRatio="none"`** บน svg.img-lines — ห้ามตัดออก
3. **อย่าคำนวณ `data-h`/viewBox ใหม่** — ใช้ค่าที่เซฟมา (คิดจากกรอบที่เห็น/crop แล้ว)
4. **พิกัด/สี/stroke เป็น inline** — แก้ที่ inline ถ้าจำเป็น ไม่ใช่หวังพึ่ง CSS
5. **% ทั้งหมด** — ห้ามแปลงเป็น px ตายตัว (จะพังตอน scale/PDF)

---

## 8. เอกสารเจาะลึกแต่ละเรื่อง

| หัวข้อ | ไฟล์ |
|---|---|
| รูปที่ crop (data-crop, remap) | `image-annotator/references/crop-support.md` |
| render เส้น/ตัวชี้/กล่องใน PDF + ขนาด crop | `weasyprint-book/print-crop-notes.md` |
| quiz + OL ลำดับ (ถ้าใช้ในแบบฝึกหัด) | `weasyprint-book/print-quiz-notes.md` |
| markup ที่สกิลผลิต (มุมผู้ผลิต) | `image-annotator/references/markup.md` |
