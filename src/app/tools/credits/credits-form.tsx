"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./credits-form.css";

/* ==============================================================
   Credits-form page (ported from book-dev/tools/credits-form.html).

   The user fills in book metadata → preview renders live on the
   right, and a <section>…</section> code block is generated below
   for the author to paste into their book.html.

   Two output templates: "ebook" (digital download) and "press"
   (print-house imposition card). Both share the same form schema
   below — fields are prefixed eb_* or pr_* to make the partition
   obvious.

   Form draft is persisted in localStorage under STORAGE_KEY. We
   intentionally don't sync to Firestore — the data is per-book and
   short-lived (author finishes one credits page then moves on).
   ============================================================== */

const STORAGE_KEY = "credits_form_v1";

type CreditsType = "ebook" | "press";

const DEFAULTS = {
  // shared
  type: "ebook" as CreditsType,

  // ── ebook fields ──
  eb_title: "Claude Cowork Step-By-Step ให้ AI ทำงานแทนคน",
  eb_author: "ทีมงาน Millionaire Dev",
  eb_year: "2569",
  eb_holder: "MillionaireDev",
  eb_restriction:
    "ห้ามคัดลอก ทำซ้ำ ดัดแปลง หรือเผยแพร่เนื้อหาส่วนใดส่วนหนึ่ง โดยไม่ได้รับอนุญาตเป็นลายลักษณ์อักษรจากผู้เขียน",
  eb_note: "หนังสือเล่มนี้จัดทำในรูปแบบ eBook สำหรับการใช้งานส่วนบุคคลเท่านั้น",
  eb_price: "250",
  eb_isbn: "__-_____-___-_",
  eb_pages: "240",

  // ── press fields ──
  pr_title: "Claude Cowork Step-By-Step ให้ AI ทำงานแทนคน",
  pr_author: "ทีมงาน Millionaire Dev",
  pr_editor: "",
  pr_price: "250",
  pr_cip_author: "ทีมงาน Millionaire Dev.",
  pr_cip_desc:
    "Claude Cowork Step-By-Step ให้ AI ทำงานแทนคน.-- นนทบุรี : ธิงค์ บียอนด์ บุ๊คส์, 2569.\n240 หน้า.\n1. ปัญญาประดิษฐ์.  2. Claude.  I. ชื่อเรื่อง.",
  pr_isbn: "",

  pr_asst_ed: "",
  pr_layout: "",
  pr_illust: "",
  pr_cover: "",
  pr_proof: "",

  pr_verify: "",
  pr_tech: "",
  pr_print_year: "",

  pr_ph_name: "บริษัท ส. พิจิตรการพิมพ์ จำกัด",
  pr_ph_addr: "50/46 หมู่ 5 ต.บางตลาด อ.ปากเกร็ด จ.นนทบุรี 11120",
  pr_ph_tel: "",
  pr_ph_fax: "",

  pr_pub_name: "บริษัท ธิงค์ บียอนด์ บุ๊คส์ จำกัด",
  pr_pub_addr:
    "200 หมู่ 4 ชั้น 19 ห้อง 1903A\nจัสมินอินเตอร์เนชั่นแนลทาวเวอร์ ถ.แจ้งวัฒนะ\nต.ปากเกร็ด อ.ปากเกร็ด จ.นนทบุรี ประเทศไทย 11120",
  pr_pub_tel: "0-2962-1081-3 (อัตโนมัติ 10 คู่สาย)",
  pr_pub_fax: "0-2962-1084",
  pr_pub_web: "www.thinkbeyondbook.com",
  pr_pub_logo: "",

  pr_dist_name: "บริษัท ไอดีซี พรีเมียร์ จำกัด",
  pr_dist_addr:
    "200 หมู่ 4 ชั้น 19 ห้อง 1901 จัสมินอินเตอร์เนชั่นแนลทาวเวอร์\nถ.แจ้งวัฒนะ ต.ปากเกร็ด อ.ปากเกร็ด จ.นนทบุรี ประเทศไทย 11120",
  pr_dist_tel: "0-2962-1081-3 (อัตโนมัติ 10 คู่สาย)",
  pr_dist_fax: "0-2962-1084",
  pr_dist_logo: "",

  pr_footer_contact:
    "โทรศัพท์ 0-2962-1081, 0-2962-2626 ต่อ 112-114   โทรสาร 0-2962-1084",
  pr_commercial_head:
    "หากต้องการนำเนื้อหาภายในเล่มไปใช้เป็นเอกสารประกอบการสอน หรือใช้ในเชิงพาณิชย์",
  pr_commercial_body:
    "กรุณาติดต่อเพื่อขอพิจารณาที่ E-mail : Thinkbeyondbooks@gmail.com หรือโทร 0-2962-2626 ต่อ 708",
};

type FormState = typeof DEFAULTS;
type StringKey = Exclude<keyof FormState, "type">;

/* ───────────────────── helpers ───────────────────── */

function escapeHtml(s: string): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Each non-empty line in `txt` becomes its own <div>.
function linesToDivs(txt: string, cls?: string): string {
  const lines = String(txt || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const c = cls ? ` class="${cls}"` : "";
  return lines.map((l) => `        <div${c}>${escapeHtml(l)}</div>`).join("\n");
}

function buildEbookSection(d: FormState): string {
  return `<section class="copyright-page">
  <div class="copyright-inner">
    <div class="copyright-label">ข้อมูลหนังสือและลิขสิทธิ์</div>
    <div class="copyright-detail"><span class="copyright-detail-label">ชื่อหนังสือ:</span> ${escapeHtml(d.eb_title)}</div>
    <div class="copyright-detail"><span class="copyright-detail-label">ผู้เขียน:</span> ${escapeHtml(d.eb_author)}</div>
    <div class="copyright-legal">สงวนลิขสิทธิ์ © ปี พ.ศ. ${escapeHtml(d.eb_year)} โดย ${escapeHtml(d.eb_holder)}</div>
    <p class="copyright-restriction">${escapeHtml(d.eb_restriction)}</p>
    <p class="copyright-note">${escapeHtml(d.eb_note)}</p>
    <div class="copyright-info-grid">
      <div class="copyright-info-item"><span class="copyright-info-label">ราคา:</span>&nbsp;${escapeHtml(d.eb_price)}<span class="copyright-info-value">&nbsp;บาท</span></div>
      <div class="copyright-info-item"><span class="copyright-info-label">ISBN:</span> <span class="copyright-info-value">${escapeHtml(d.eb_isbn)}</span></div>
      <div class="copyright-info-item"><span class="copyright-info-label">จำนวนหน้า:</span> <span class="copyright-info-value">${escapeHtml(d.eb_pages)} หน้า</span></div>
    </div>
  </div>
</section>`;
}

function buildPressSection(d: FormState): string {
  const logoHtml = (url: string, fallback: string) =>
    url
      ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(fallback)}">`
      : escapeHtml(fallback);
  const editor = d.pr_editor
    ? escapeHtml(d.pr_editor)
    : '<span class="placeholder">((กรอกชื่อบรรณาธิการ))</span>';
  const isbn = d.pr_isbn
    ? escapeHtml(d.pr_isbn)
    : '<span class="placeholder">((กรอก ISBN))</span>';
  const prodRow = (label: string, val: string) => {
    const v = val
      ? escapeHtml(val)
      : '<span class="placeholder">((กรอก))</span>';
    return `        <div class="row"><span class="label">${label} :</span><span>${v}</span></div>`;
  };
  const verifyVal = d.pr_verify
    ? escapeHtml(d.pr_verify)
    : '<span class="placeholder">((ทีมตรวจสอบ))</span>';
  const techVal = d.pr_tech
    ? escapeHtml(d.pr_tech)
    : '<span class="placeholder">((รายชื่อทีมเทคนิค))</span>';
  const yearVal = d.pr_print_year
    ? escapeHtml(d.pr_print_year)
    : '<span class="placeholder">((วัน เดือน พ.ศ.))</span>';
  const phTel = d.pr_ph_tel
    ? escapeHtml(d.pr_ph_tel)
    : '<span class="placeholder">((เบอร์))</span>';
  const phFax = d.pr_ph_fax
    ? escapeHtml(d.pr_ph_fax)
    : '<span class="placeholder">((แฟกซ์))</span>';

  return `<section class="credits-page">

  <div class="credits-page-header">
    <div class="book-title">${escapeHtml(d.pr_title)}</div>
    <div class="meta-row">
      <div><span class="label">ผู้เขียน :</span> ${escapeHtml(d.pr_author)}</div>
      <div><span class="label">บรรณาธิการ :</span> ${editor}</div>
    </div>
    <div class="price">ราคา ${escapeHtml(d.pr_price)} บาท</div>
  </div>

  <div class="row-cip-copyright">
    <div class="cip">
      <h3>ข้อมูลทางบรรณานุกรมของหอสมุดแห่งชาติ/<br>National Library of Thailand Cataloging in Publication Data</h3>
      <div class="cip-author">${escapeHtml(d.pr_cip_author)}</div>
${linesToDivs(d.pr_cip_desc, "cip-desc")}
      <div class="cip-isbn">ISBN ${isbn}</div>
    </div>
    <div class="copyright-block">
      <div class="law-year">สงวนลิขสิทธิ์ตามพระราชบัญญัติลิขสิทธิ์ พ.ศ.2537</div>
      <div class="by-publisher">โดย ${escapeHtml(d.pr_pub_name)}</div>
      <div class="notice">
        ห้ามลอกเลียนแบบส่วนใดส่วนหนึ่งของหนังสือเล่มนี้ ไม่ว่ารูปแบบใด ๆ
        นอกจากจะได้รับอนุญาตเป็นลายลักษณ์อักษรจากผู้จัดพิมพ์เท่านั้น
      </div>
    </div>
  </div>

  <div class="row-production">
    <div class="production">
      <h3>ฝ่ายผลิต</h3>
      <div class="production-list">
${prodRow("ผู้ช่วยบรรณาธิการ", d.pr_asst_ed)}
${prodRow("จัดรูปเล่ม", d.pr_layout)}
${prodRow("ภาพประกอบ", d.pr_illust)}
${prodRow("ออกแบบปก", d.pr_cover)}
${prodRow("พิสูจน์อักษร", d.pr_proof)}
      </div>
    </div>
    <div class="verification">
      <div class="row">
        <span class="label">ตรวจสอบความถูกต้อง :</span>
        <span>${verifyVal}</span>
      </div>
      <div class="row">
        <span class="label">เทคนิคการผลิต :</span>
        <span>${techVal}</span>
      </div>
      <div class="row">
        <span class="label">ปีที่พิมพ์ :</span>
        <span>${yearVal}</span>
      </div>
    </div>
  </div>

  <div class="print-house">
    <h3>พิมพ์ที่</h3>
    <div class="name">${escapeHtml(d.pr_ph_name)}</div>
    <div class="address-line">${escapeHtml(d.pr_ph_addr)}</div>
    <div>โทรศัพท์ ${phTel}</div>
    <div>โทรสาร ${phFax}</div>
  </div>

  <div class="row-publisher">
    <div class="publisher">
      <h3>จัดพิมพ์โดย</h3>
      <div class="logo">${logoHtml(d.pr_pub_logo, "Think Beyond logo")}</div>
      <div class="name">${escapeHtml(d.pr_pub_name)}</div>
${linesToDivs(d.pr_pub_addr)}
      <div>โทรศัพท์ ${escapeHtml(d.pr_pub_tel)}</div>
      <div>โทรสาร ${escapeHtml(d.pr_pub_fax)}</div>
      <div>เสนอความคิดเห็น / งานเขียน / งานออกแบบได้ที่</div>
      <div class="web">${escapeHtml(d.pr_pub_web)}</div>
    </div>
    <div class="distributor">
      <h3>จัดจำหน่ายทั่วประเทศโดย</h3>
      <div class="logo">${logoHtml(d.pr_dist_logo, "IDC logo")}</div>
      <div class="name">${escapeHtml(d.pr_dist_name)}</div>
${linesToDivs(d.pr_dist_addr)}
      <div>โทรศัพท์ ${escapeHtml(d.pr_dist_tel)}</div>
      <div>โทรสาร ${escapeHtml(d.pr_dist_fax)}</div>
    </div>
  </div>

  <div class="credits-footer">
    <div class="for-retail">สำหรับร้านค้า และตัวแทนจำหน่าย สนใจสั่งซื้อหนังสือจำนวนมาก</div>
    <div>${escapeHtml(d.pr_footer_contact)}</div>
    <div class="commercial-notice">
      <div class="heading">${escapeHtml(d.pr_commercial_head)}</div>
      <div>${escapeHtml(d.pr_commercial_body)}</div>
    </div>
  </div>

</section>`;
}

/* ───────────────────── component ───────────────────── */

export function CreditsForm() {
  // Hydrate from DEFAULTS first (SSR-safe). localStorage takes over on
  // mount via useEffect — never read it during render, that would cause
  // a hydration mismatch.
  const [data, setData] = useState<FormState>(DEFAULTS);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);

  // Load saved draft on mount.
  //
  // The cascading render here is intentional: we cannot read localStorage
  // during the initial render because the component also runs on the
  // server (SSR), where `window` doesn't exist. If we tried to read it
  // synchronously the server would render DEFAULTS while the client
  // rendered the saved draft, causing a hydration mismatch warning. By
  // rendering DEFAULTS first and swapping in the saved draft inside an
  // effect, both server and initial client render produce the same HTML;
  // the second client render then hydrates the form with the draft.
  //
  // This is exactly the pattern the React docs call out as valid for
  // localStorage hydration ("Resetting all state when a prop changes" →
  // "Storing information from previous renders"), but the
  // react-hooks/set-state-in-effect rule can't tell it apart from a true
  // cascading-render bug, hence the targeted suppression.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<FormState>;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData((d) => ({ ...d, ...parsed }));
    } catch {
      /* ignore corrupted draft */
    }
  }, []);

  // Persist on change (debounced via microtask — same effect as the
  // original which saved on every input event).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* quota exceeded / disabled — no-op */
    }
  }, [data]);

  const isPress = data.type === "press";

  // Derived HTML — recomputes whenever any field changes.
  const sectionHtml = useMemo(
    () => (isPress ? buildPressSection(data) : buildEbookSection(data)),
    [data, isPress],
  );

  // For preview we want only the inside of <section> (avoid nesting
  // another <section> inside our scoped preview-page div).
  const previewInner = useMemo(() => {
    const m = sectionHtml.match(/<section[^>]*>([\s\S]*?)<\/section>/);
    return m ? m[1] : sectionHtml;
  }, [sectionHtml]);

  const updateField = useCallback(
    (key: StringKey, value: string) =>
      setData((d) => ({ ...d, [key]: value })),
    [],
  );

  const updateType = useCallback(
    (next: CreditsType) => setData((d) => ({ ...d, type: next })),
    [],
  );

  const showFlash = useCallback((msg: string) => {
    setFlash(msg);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1500);
  }, []);

  const copyHtml = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sectionHtml);
      showFlash("คัดลอกแล้ว ✓");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showFlash(`ไม่สามารถคัดลอกได้: ${msg}`);
    }
  }, [sectionHtml, showFlash]);

  const resetForm = useCallback(() => {
    if (!window.confirm("รีเซ็ตทุกฟิลด์เป็นค่าเริ่มต้น? (ค่าที่กรอกไว้จะหาย)"))
      return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setData(DEFAULTS);
    showFlash("รีเซ็ตเรียบร้อย");
  }, [showFlash]);

  return (
    <>
      <header className="credits-header">
        <div>
          <h2>เครื่องมือสร้างหน้าเครดิต</h2>
          <div className="sub">
            กรอกฟอร์ม → ได้ &lt;section&gt;...&lt;/section&gt;
            ไปแปะใน book.html ด้วยตนเอง
          </div>
        </div>
      </header>

      <div className="credits-type-bar">
        <strong style={{ fontSize: 13 }}>ประเภท :</strong>
        <label>
          <input
            type="radio"
            name="type"
            value="ebook"
            checked={data.type === "ebook"}
            onChange={() => updateType("ebook")}
          />
          e-book (ขนาด 170×228)
        </label>
        <label>
          <input
            type="radio"
            name="type"
            value="press"
            checked={data.type === "press"}
            onChange={() => updateType("press")}
          />
          ส่งโรงพิมพ์ (ขนาด 170×228)
        </label>
        <div className="actions">
          <button type="button" onClick={resetForm}>
            รีเซ็ตฟอร์ม
          </button>
        </div>
      </div>

      <div className="credits-app">
        {/* ============ LEFT: Form ============ */}
        <div className="credits-form-panel">
          {isPress ? (
            <PressFields data={data} update={updateField} />
          ) : (
            <EbookFields data={data} update={updateField} />
          )}
        </div>

        {/* ============ RIGHT: Preview + Code ============ */}
        <div className="credits-right-panel">
          <div className="credits-preview-wrap">
            <div
              className={`credits-preview-page ${isPress ? "press" : "ebook"}`}
              dangerouslySetInnerHTML={{ __html: previewInner }}
            />
          </div>
          <div className="credits-code-wrap">
            <div className="credits-code-header">
              <span>
                โค้ด <span className="tag">&lt;section&gt;</span>{" "}
                สำหรับวางใน book.html
              </span>
              <button type="button" onClick={copyHtml}>
                📋 Copy HTML
              </button>
            </div>
            <pre className="credits-code-box">{sectionHtml}</pre>
          </div>
        </div>
      </div>

      <div
        className={`credits-flash ${flash ? "show" : ""}`}
        role="status"
        aria-live="polite"
      >
        {flash ?? ""}
      </div>
    </>
  );
}

/* ───────────────────── sub-components ───────────────────── */

type FieldsProps = {
  data: FormState;
  update: (key: StringKey, value: string) => void;
};

function EbookFields({ data, update }: FieldsProps) {
  return (
    <>
      <section className="credits-form-section">
        <h3>ข้อมูลหนังสือ</h3>
        <TextField
          label="ชื่อหนังสือ"
          value={data.eb_title}
          onChange={(v) => update("eb_title", v)}
        />
        <TextField
          label="ผู้เขียน"
          value={data.eb_author}
          onChange={(v) => update("eb_author", v)}
        />
      </section>

      <section className="credits-form-section">
        <h3>ลิขสิทธิ์</h3>
        <div className="credits-row2">
          <TextField
            label="ปี พ.ศ."
            value={data.eb_year}
            onChange={(v) => update("eb_year", v)}
          />
          <TextField
            label="เจ้าของลิขสิทธิ์"
            value={data.eb_holder}
            onChange={(v) => update("eb_holder", v)}
          />
        </div>
        <TextAreaField
          label="ข้อความสงวนสิทธิ์"
          value={data.eb_restriction}
          onChange={(v) => update("eb_restriction", v)}
        />
        <TextAreaField
          label="หมายเหตุ"
          value={data.eb_note}
          onChange={(v) => update("eb_note", v)}
        />
      </section>

      <section className="credits-form-section">
        <h3>ข้อมูลเล่ม</h3>
        <TextField
          label="ราคา"
          value={data.eb_price}
          onChange={(v) => update("eb_price", v)}
        />
        <TextField
          label="ISBN"
          value={data.eb_isbn}
          onChange={(v) => update("eb_isbn", v)}
        />
        <TextField
          label="จำนวนหน้า"
          value={data.eb_pages}
          onChange={(v) => update("eb_pages", v)}
        />
      </section>
    </>
  );
}

function PressFields({ data, update }: FieldsProps) {
  return (
    <>
      <section className="credits-form-section">
        <h3>Header</h3>
        <TextField
          label="ชื่อหนังสือ"
          value={data.pr_title}
          onChange={(v) => update("pr_title", v)}
        />
        <div className="credits-row2">
          <TextField
            label="ผู้เขียน"
            value={data.pr_author}
            onChange={(v) => update("pr_author", v)}
          />
          <TextField
            label="บรรณาธิการ"
            value={data.pr_editor}
            onChange={(v) => update("pr_editor", v)}
          />
        </div>
        <TextField
          label="ราคา (บาท)"
          value={data.pr_price}
          onChange={(v) => update("pr_price", v)}
        />
      </section>

      <section className="credits-form-section">
        <h3>ข้อมูลบรรณานุกรม (CIP)</h3>
        <TextField
          label="ผู้เขียน (สำหรับ CIP)"
          value={data.pr_cip_author}
          onChange={(v) => update("pr_cip_author", v)}
        />
        <TextAreaField
          label="รายละเอียดหนังสือ"
          hint="แต่ละบรรทัด = 1 div ใน HTML"
          value={data.pr_cip_desc}
          onChange={(v) => update("pr_cip_desc", v)}
        />
        <TextField
          label="ISBN"
          value={data.pr_isbn}
          onChange={(v) => update("pr_isbn", v)}
        />
      </section>

      <section className="credits-form-section">
        <h3>ฝ่ายผลิต</h3>
        <TextField
          label="ผู้ช่วยบรรณาธิการ"
          value={data.pr_asst_ed}
          onChange={(v) => update("pr_asst_ed", v)}
        />
        <TextField
          label="จัดรูปเล่ม"
          value={data.pr_layout}
          onChange={(v) => update("pr_layout", v)}
        />
        <TextField
          label="ภาพประกอบ"
          value={data.pr_illust}
          onChange={(v) => update("pr_illust", v)}
        />
        <TextField
          label="ออกแบบปก"
          value={data.pr_cover}
          onChange={(v) => update("pr_cover", v)}
        />
        <TextField
          label="พิสูจน์อักษร"
          value={data.pr_proof}
          onChange={(v) => update("pr_proof", v)}
        />
      </section>

      <section className="credits-form-section">
        <h3>ตรวจสอบ & ปีที่พิมพ์</h3>
        <TextField
          label="ทีมตรวจสอบความถูกต้อง"
          value={data.pr_verify}
          onChange={(v) => update("pr_verify", v)}
        />
        <TextField
          label="ทีมเทคนิคการผลิต"
          value={data.pr_tech}
          onChange={(v) => update("pr_tech", v)}
        />
        <TextField
          label="ปีที่พิมพ์"
          value={data.pr_print_year}
          onChange={(v) => update("pr_print_year", v)}
          placeholder="เช่น พฤษภาคม 2569"
        />
      </section>

      <section className="credits-form-section">
        <h3>โรงพิมพ์</h3>
        <TextField
          label="ชื่อโรงพิมพ์"
          value={data.pr_ph_name}
          onChange={(v) => update("pr_ph_name", v)}
        />
        <TextField
          label="ที่อยู่"
          value={data.pr_ph_addr}
          onChange={(v) => update("pr_ph_addr", v)}
        />
        <div className="credits-row2">
          <TextField
            label="โทรศัพท์"
            value={data.pr_ph_tel}
            onChange={(v) => update("pr_ph_tel", v)}
          />
          <TextField
            label="โทรสาร"
            value={data.pr_ph_fax}
            onChange={(v) => update("pr_ph_fax", v)}
          />
        </div>
      </section>

      <section className="credits-form-section">
        <h3>จัดพิมพ์โดย (Publisher)</h3>
        <TextField
          label="ชื่อ"
          value={data.pr_pub_name}
          onChange={(v) => update("pr_pub_name", v)}
        />
        <TextAreaField
          label="ที่อยู่ (แต่ละบรรทัด = 1 div)"
          value={data.pr_pub_addr}
          onChange={(v) => update("pr_pub_addr", v)}
        />
        <TextField
          label="โทรศัพท์"
          value={data.pr_pub_tel}
          onChange={(v) => update("pr_pub_tel", v)}
        />
        <TextField
          label="โทรสาร"
          value={data.pr_pub_fax}
          onChange={(v) => update("pr_pub_fax", v)}
        />
        <TextField
          label="เว็บไซต์"
          value={data.pr_pub_web}
          onChange={(v) => update("pr_pub_web", v)}
        />
        <TextField
          label="URL หรือ path ของ logo (.png/.svg)"
          value={data.pr_pub_logo}
          onChange={(v) => update("pr_pub_logo", v)}
          placeholder="เช่น assets/thinkbeyond-logo.png"
        />
      </section>

      <section className="credits-form-section">
        <h3>จัดจำหน่าย (Distributor)</h3>
        <TextField
          label="ชื่อ"
          value={data.pr_dist_name}
          onChange={(v) => update("pr_dist_name", v)}
        />
        <TextAreaField
          label="ที่อยู่ (แต่ละบรรทัด = 1 div)"
          value={data.pr_dist_addr}
          onChange={(v) => update("pr_dist_addr", v)}
        />
        <TextField
          label="โทรศัพท์"
          value={data.pr_dist_tel}
          onChange={(v) => update("pr_dist_tel", v)}
        />
        <TextField
          label="โทรสาร"
          value={data.pr_dist_fax}
          onChange={(v) => update("pr_dist_fax", v)}
        />
        <TextField
          label="URL หรือ path ของ logo"
          value={data.pr_dist_logo}
          onChange={(v) => update("pr_dist_logo", v)}
          placeholder="เช่น assets/idc-logo.png"
        />
      </section>

      <section className="credits-form-section">
        <h3>Footer</h3>
        <TextField
          label="ติดต่อสำหรับร้านค้า (บรรทัดเดียว)"
          value={data.pr_footer_contact}
          onChange={(v) => update("pr_footer_contact", v)}
        />
        <TextField
          label="หัวข้อกล่องเชิงพาณิชย์"
          value={data.pr_commercial_head}
          onChange={(v) => update("pr_commercial_head", v)}
        />
        <TextField
          label="วิธีติดต่อ"
          value={data.pr_commercial_body}
          onChange={(v) => update("pr_commercial_body", v)}
        />
      </section>
    </>
  );
}

/* ───────────────────── primitives ───────────────────── */

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
};

function TextField({ label, value, onChange, placeholder, hint }: TextFieldProps) {
  return (
    <div className="credits-field">
      <label>{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <div className="credits-field-hint">{hint}</div>}
    </div>
  );
}

function TextAreaField({ label, value, onChange, placeholder, hint }: TextFieldProps) {
  return (
    <div className="credits-field">
      <label>{label}</label>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
      />
      {hint && <div className="credits-field-hint">{hint}</div>}
    </div>
  );
}
