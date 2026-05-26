# Math / LaTeX Support — Implementation Notes

**Status:** 📌 ค้างไว้ — เดี๋ยวค่อยทำ (deferred)
**Date drafted:** 2026-05-26
**Use case:** หนังสือคณิตศาสตร์ / ฟิสิกส์ / วิศวกรรม ที่ต้องแสดงสูตรสวยๆ

---

## 📐 ภาพรวม — 2 ส่วนต้องทำพร้อมกัน

| ส่วน | ทำอะไร | ที่ไหน |
|---|---|---|
| **1. Prompt template** | บอก AI ให้ใช้ LaTeX syntax | `/templates/new?scope=shared` (admin UI) |
| **2. HTML render** | โหลด KaTeX render LaTeX → คณิตศาสตร์สวยๆ | n8n "สร้าง HTML" node + Vercel `book-template-css.ts` |

ถ้าทำแค่ส่วนเดียว: AI emit `$x^2$` แต่ไม่มี renderer → แสดงเป็น raw text `$x^2$`

---

## 1️⃣ Prompt Template — `+ สูตรคณิตศาสตร์ (LaTeX)`

Admin สร้างที่ `/templates/new?scope=shared`:

- **ชื่อ:** `+ สูตรคณิตศาสตร์ (LaTeX)`
- **หมวด:** `structure`
- **Scope:** `🌐 Shared`
- **เนื้อหา snippet:**

```markdown
## รูปแบบสูตรคณิตศาสตร์
ทุกสูตรคณิตศาสตร์ในเนื้อหา ใช้ LaTeX syntax (ระบบจะ render ด้วย KaTeX)

### Syntax พื้นฐาน
- Inline math (แทรกในประโยค): `$E = mc^2$`
- Block math (สูตรเด่นกลางหน้า): `$$\int_0^\infty e^{-x}\,dx = 1$$`
- ห้ามใช้ Unicode สัญลักษณ์คณิต (เช่น ∑, ∫, π) — ใช้ LaTeX command แทน (\sum, \int, \pi)

### Command ที่ใช้บ่อย
- เครื่องหมายกรีก: `\alpha, \beta, \gamma, \pi, \theta, \sigma, \omega`
- ตัวดำเนินการ: `\sum, \prod, \int, \lim, \log, \sin, \cos, \tan`
- เศษส่วน: `\frac{a}{b}`
- ยกกำลัง / ห้อย: `x^2, x^{n+1}, x_i, x_{i,j}`
- รากที่ n: `\sqrt{x}, \sqrt[3]{x}`
- เครื่องหมาย: `\le, \ge, \ne, \approx, \times, \div, \pm, \infty`
- วงเล็บใหญ่: `\left( ... \right), \left[ ... \right], \left\{ ... \right\}`
- เมทริกซ์:
  $$\begin{pmatrix} a & b \\ c & d \end{pmatrix}$$
- ระบบสมการ:
  $$\begin{cases} x + y = 1 \\ x - y = 3 \end{cases}$$

### ตัวอย่างที่ถูกต้อง
- "สูตรพีทาโกรัส $a^2 + b^2 = c^2$ ใช้กับสามเหลี่ยมมุมฉาก"
- "พหุนาม $ax^2 + bx + c = 0$ มีราก $$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$$"
- "อนุกรมเรขาคณิต $\sum_{n=0}^{\infty} ar^n = \frac{a}{1-r}$ เมื่อ $|r| < 1$"

### ห้ามทำ
- ห้ามใช้สัญลักษณ์ Unicode (∑, ∫, ÷, ≥) — ใช้ LaTeX command
- ห้ามใช้ `$` ในข้อความปกติที่ไม่ใช่สูตร — ถ้าจำเป็น escape เป็น `\$`
- ห้ามใส่ space ระหว่าง `$` กับสูตร: `$ x^2 $` ผิด → `$x^2$` ถูก
- ห้ามใช้ rich text format (เช่น **bold**) ในสูตร — ใช้ `\mathbf{x}` แทน
```

---

## 2️⃣ HTML Render — โหลด KaTeX

### A. ในโหนด `สร้าง HTML` ของ n8n

หาตำแหน่ง `<link rel="stylesheet" href="https://fonts.googleapis.com/...` ใน Code node → เพิ่ม KaTeX CSS ต่อท้าย:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
```

แล้วเพิ่ม script ก่อน `</body>`:

```html
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
onload="renderMathInElement(document.body, {
  delimiters: [
    {left: '$$', right: '$$', display: true},
    {left: '$', right: '$', display: false}
  ],
  throwOnError: false
});"></script>
```

**ลำดับสำคัญ:** CSS โหลดทันที (no defer) + script defer

### B. ในไฟล์ Vercel `src/lib/content/book-template-css.ts`

ตอน assemble book → ต้องเพิ่ม KaTeX แบบเดียวกัน

(ต้องดูโครงไฟล์ — น่าจะมี HTML template string ตรงที่ build full book.html)

---

## 🎨 Styling เพิ่มเติม

เพิ่ม CSS:

```css
/* KaTeX math styling */
.katex-display {
  margin: 24px 0;
  text-align: center;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 12px 0;
}
.katex {
  font-size: 1.08em;
}
.content .katex-display > .katex {
  font-size: 1.15em;
}
```

---

## ⚠️ จุดที่ต้องระวัง

### 1. PDF Print
KaTeX render **client-side** หลังโหลดหน้า → ถ้า "Print to PDF" ทันทีก่อน script รัน → สูตรอาจไม่ render

แก้: เพิ่ม wait 500ms ก่อน print:
```js
window.addEventListener('load', () => setTimeout(() => {}, 500));
```

### 2. การ Escape ใน Markdown
ถ้า AI ใส่ `$x_i$` แต่ markdown parser ตีความ `_i_` เป็น *i* (italic) → KaTeX จะรับ broken syntax

แก้: ใน Code node "สร้าง HTML" → **process math ก่อน markdown**:

```javascript
// ก่อน mdToHtml() — ป้องกัน $ ถูก markdown escape
let mathBlocks = [];
content = content.replace(/\$\$([\s\S]+?)\$\$/g, (m, eq) => {
  mathBlocks.push(`$$${eq}$$`);
  return `%%MATH_${mathBlocks.length - 1}%%`;
});
content = content.replace(/\$([^$\n]+?)\$/g, (m, eq) => {
  mathBlocks.push(`$${eq}$`);
  return `%%MATH_${mathBlocks.length - 1}%%`;
});

// ...mdToHtml(content)...

// หลัง mdToHtml — เอา math กลับ
html = html.replace(/%%MATH_(\d+)%%/g, (_, i) => mathBlocks[+i]);
```

### 3. Auto-render performance
ถ้าหนังสือมี 50+ สูตร → KaTeX render ใช้เวลาเห็นได้ (200-500ms) → ผู้อ่านอาจเห็น `$x^2$` ก่อน render เสร็จ

แก้: ใส่ CSS ซ่อนหน้าก่อน → แสดงเมื่อ KaTeX เสร็จ:
```css
body { visibility: hidden; }
body.katex-ready { visibility: visible; }
```
```js
renderMathInElement(document.body, {...}, () => {
  document.body.classList.add('katex-ready');
});
```

---

## 📋 Implementation Checklist (เมื่อพร้อมทำ)

- [ ] Admin สร้าง shared template `+ สูตรคณิตศาสตร์ (LaTeX)` ตาม snippet ด้านบน
- [ ] อัปเดต n8n Code node "สร้าง HTML" — เพิ่ม KaTeX CSS + JS + math escape logic
- [ ] อัปเดต Vercel `src/lib/content/book-template-css.ts` — เพิ่ม KaTeX ใน assemble template
- [ ] เพิ่ม CSS styling สำหรับ `.katex-display` (centering + overflow)
- [ ] (Optional) เพิ่ม body visibility guard ป้องกัน flash of unrendered math
- [ ] ทดสอบ:
  - [ ] เขียน inline `$E = mc^2$` → render ได้
  - [ ] เขียน block `$$\int_0^1 dx$$` → render เป็น display style
  - [ ] เขียนเมทริกซ์ → render ถูก
  - [ ] Print to PDF → สูตรไม่หาย
  - [ ] Markdown italic `*italic*` + math `$x_i$` ไม่ตีกัน

---

## 🔗 References

- KaTeX docs: https://katex.org/docs/api.html
- Auto-render extension: https://katex.org/docs/autorender.html
- LaTeX cheatsheet: https://katex.org/docs/supported.html

## 🤔 Alternative considered

- **MathJax** — รุ่นเก่ากว่า render ช้ากว่า KaTeX แต่ feature ครอบคลุมกว่า → ไม่ใช้
- **Server-side render (katex-cli)** — render เป็น HTML ตรงๆ ไม่ต้องโหลด JS client → ดีกว่าสำหรับ PDF แต่ effort สูงกว่า

→ เลือก KaTeX client-side เพราะเร็ว + setup ง่าย + book.html ใช้กับ browser อยู่แล้ว
