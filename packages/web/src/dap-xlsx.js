/* DAP xlsx parser. Anchors on the "Distribution" sheet and maps the
   ACV/velocity block to the schema. */
import JSZip from 'jszip';

const CAL = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHSET = new Set(CAL);

function colLetters(ref) { return ref.match(/^[A-Z]+/)[0]; }
function colToNum(letters) {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n;
}

function parseSharedStrings(xml) {
  const strs = [];
  const re = /<si>([\s\S]*?)<\/si>/g; let m;
  while ((m = re.exec(xml))) {
    const txt = (m[1].match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, "")).join("");
    strs.push(decodeEntities(txt));
  }
  return strs;
}
function decodeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

function parseSheet(xml, strs) {
  const rows = {}; let maxRow = 0;
  const cre = /<c r="([A-Z]+\d+)"([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g; let cm;
  while ((cm = cre.exec(xml))) {
    const ref = cm[1], attrs = cm[2] || "", inner = cm[3] || "";
    const rn = parseInt(ref.match(/\d+/)[0], 10);
    if (rn > maxRow) maxRow = rn;
    const t = (attrs.match(/t="([^"]*)"/) || [])[1];
    const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
    let val = vm ? vm[1] : "";
    if (t === "s") val = strs[parseInt(val, 10)];
    else if (t === "str") val = decodeEntities(val);
    else if (t === "inlineStr") {
      const im = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      val = im ? decodeEntities(im[1].replace(/<[^>]+>/g, "")) : "";
    }
    (rows[rn] = rows[rn] || {})[colLetters(ref)] = val;
  }
  return { rows, maxRow };
}

function num(v) {
  if (v === "" || v == null) return 0;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function locateColumns(rows, maxRow) {
  for (let r = 1; r <= Math.min(maxRow, 40); r++) {
    const row = rows[r]; if (!row) continue;
    const byLabel = {};
    for (const col in row) {
      const label = String(row[col]).trim();
      if (label) byLabel[label.toLowerCase()] = col;
    }
    const acvCol = byLabel["account current acv"];
    const probCol = byLabel["probability distro change"];
    if (acvCol && probCol) {
      const pg = byLabel["pg"] || byLabel["product group"] || byLabel["product group (with link)"];
      const item = byLabel["item"] || byLabel["sku"] || byLabel["sku_name"];
      const vel = byLabel["account base unit velocity"] || byLabel["base velocity"] || byLabel["use velocity"];
      const lo = colToNum(acvCol), hi = colToNum(probCol);
      const monthCols = {};
      for (const col in row) {
        const cn = colToNum(col);
        if (cn > lo && cn < hi) {
          const label = String(row[col]).trim();
          if (MONTHSET.has(label) && !monthCols[label]) monthCols[label] = col;
        }
      }
      return { headerRow: r, pg, item, vel, acvCol, probCol, monthCols };
    }
  }
  return null;
}

export async function parseDAP(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);

  const ssFile = zip.file("xl/sharedStrings.xml");
  const strs = ssFile ? parseSharedStrings(await ssFile.async("string")) : [];

  const wb = await zip.file("xl/workbook.xml").async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const ridToTarget = {};
  let rm; const rre = /<Relationship[^>]*Id="([^"]*)"[^>]*Target="([^"]*)"/g;
  while ((rm = rre.exec(rels))) ridToTarget[rm[1]] = rm[2];
  const sheets = [];
  let sm; const sre = /<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g;
  while ((sm = sre.exec(wb))) sheets.push({ name: decodeEntities(sm[1]), rid: sm[2] });

  const ordered = sheets.slice().sort((a, b) => {
    const pa = /^distribution$/i.test(a.name) ? 0 : 1;
    const pb = /^distribution$/i.test(b.name) ? 0 : 1;
    return pa - pb;
  });

  for (const sh of ordered) {
    const target = ridToTarget[sh.rid];
    if (!target) continue;
    const path = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\/?xl\//, "");
    const file = zip.file(path) || zip.file("xl/" + target);
    if (!file) continue;
    const xml = await file.async("string");
    const { rows, maxRow } = parseSheet(xml, strs);
    const loc = locateColumns(rows, maxRow);
    if (!loc) continue;

    const out = [];
    let idc = 0;
    for (let r = loc.headerRow + 1; r <= maxRow; r++) {
      const row = rows[r]; if (!row) continue;
      const pgVal = loc.pg ? String(row[loc.pg] || "").trim() : "";
      const itemVal = loc.item ? String(row[loc.item] || "").trim() : "";
      if (!pgVal && !itemVal) continue;
      const months = {};
      CAL.forEach((m) => {
        const c = loc.monthCols[m];
        months[m] = c ? round1(num(row[c])) : 0;
      });
      let prob = num(row[loc.probCol]);
      if (prob <= 1) prob = prob * 100;
      out.push({
        id: "row-" + idc++,
        Product_Group: pgVal || "(none)",
        SKU_name: itemVal || pgVal,
        unit_velocity: round2(loc.vel ? num(row[loc.vel]) : 0),
        current_ACV: round1(num(row[loc.acvCol])),
        months,
        dist_prob: Math.round(prob),
      });
    }
    if (out.length) return { rows: out, sheet: sh.name, monthsFound: Object.keys(loc.monthCols).length };
  }
  throw new Error("Couldn't find a Distribution table. Expected headers 'Account Current ACV' and 'Probability Distro Change'.");
}

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }
