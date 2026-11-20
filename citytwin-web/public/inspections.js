// Wartung / inspection reports: upload -> review & accept -> pin on the map.
// Needs the global `map` (MapLibre) from index.html. Load this file after that script.
(() => {
  const css = `
  #insp-btn { position: absolute; top: 84px; left: 12px; z-index: 1; border: none;
    border-radius: 8px; padding: 8px 12px; background: #185FA5; color: #fff; font-size: 13px; cursor: pointer; }
  #insp-pending { position: absolute; top: 120px; left: 12px; z-index: 1; background: #fff;
    border: 0.5px solid #ccc; border-radius: 8px; padding: 6px 10px; font-size: 12px; max-width: 260px; }
  #insp-pending.hidden, #insp-review.hidden { display: none; }
  #insp-pending button { border: none; background: none; color: #185FA5; cursor: pointer; padding: 2px 0; text-align: left; }
  #insp-review { position: fixed; top: 12px; left: 12px; bottom: 12px; width: 360px; z-index: 3;
    background: #fff; border: 0.5px solid #ccc; border-radius: 12px; display: flex; flex-direction: column; font-size: 13px; }
  #insp-review header { padding: 10px 12px; border-bottom: 0.5px solid #ddd; font-weight: 600;
    display: flex; justify-content: space-between; gap: 8px; }
  #insp-review header button { border: none; background: none; font-size: 18px; cursor: pointer; }
  #insp-body { flex: 1; overflow-y: auto; padding: 10px 12px; }
  #insp-body label { display: block; margin: 8px 0 2px; color: #444; }
  #insp-body input, #insp-body select, #insp-body textarea { width: 100%; box-sizing: border-box;
    padding: 6px; border: 0.5px solid #bbb; border-radius: 6px; font: inherit; }
  #insp-body input.changed, #insp-body textarea.changed, #insp-body select.changed { background: #FFF8E1; }
  .insp-chip { display: inline-block; margin: 3px 3px 0 0; padding: 3px 6px; border-radius: 999px;
    border: 0.5px solid #bbb; background: #f6f6f6; cursor: pointer; font-size: 12px; }
  .insp-hint { color: #666; font-size: 12px; margin: 6px 0; }
  .insp-warn { color: #A32D2D; }
  #insp-review footer { display: flex; gap: 6px; padding: 10px 12px; border-top: 0.5px solid #ddd; }
  #insp-review footer button { flex: 1; padding: 8px; border-radius: 8px; border: 0.5px solid #bbb; background: #fff; cursor: pointer; }
  #insp-accept { background: #1D7A46 !important; color: #fff; border: none !important; }
  .insp-pop h3 { margin: 0 0 4px; font-size: 14px; }
  .insp-pop dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; font-size: 12px; }
  .insp-pop dt { color: #666; } .insp-pop dd { margin: 0; }
  .insp-pop a { display: inline-block; margin-top: 6px; }`;
  document.head.appendChild(Object.assign(document.createElement("style"), { textContent: css }));

  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    kids.forEach(k => n.append(k));
    return n;
  };
  const COLORS = { "ohne Mängel": "#1D7A46", "mit Mängeln": "#C0392B", "unbekannt": "#7F7F7F" };

  // ---------- upload button + pending list
  const fileInput = el("input", { type: "file", accept: "application/pdf,.pdf", hidden: true });
  const btn = el("button", { id: "insp-btn", textContent: "Upload Wartung PDF" });
  const pending = el("div", { id: "insp-pending", className: "hidden" });
  document.body.append(fileInput, btn, pending);
  btn.onclick = () => fileInput.click();

  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    btn.disabled = true;
    btn.textContent = "Reading " + file.name + "…";
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/inspections/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      if (data.status === "approved") {
        alert("This report was already accepted. Showing it on the map.");
        map.flyTo({ center: [data.lon, data.lat], zoom: 18 });
      } else {
        openReview(data);
      }
    } catch (e) {
      alert(e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Upload Wartung PDF";
      loadPending();
    }
  };

  async function loadPending() {
    try {
      const rows = await (await fetch("/api/inspections/pending")).json();
      pending.replaceChildren(el("div", { textContent: `Waiting for review (${rows.length}):` }));
      rows.forEach(r => pending.append(el("div", {},
        el("button", { textContent: r.original_name, onclick: async () =>
          openReview(await (await fetch(`/api/inspections/${r.report_id}`)).json()) }))));
      pending.classList.toggle("hidden", rows.length === 0);
    } catch { /* server not ready */ }
  }

  // ---------- review panel
  const review = el("div", { id: "insp-review", className: "hidden" });
  document.body.append(review);
  let draftMarker = null;

  function placeDraft(lon, lat, fly = true) {
    if (!draftMarker) {
      draftMarker = new maplibregl.Marker({ color: "#E67E22", draggable: true });
    }
    draftMarker.setLngLat([lon, lat]).addTo(map);
    if (fly) map.flyTo({ center: [lon, lat], zoom: 18, pitch: 50 });
  }

  function closeReview() {
    review.classList.add("hidden");
    if (draftMarker) draftMarker.remove();
  }

  function openReview(r) {
    const extracted = r.extracted || {};
    const inputs = {};
    const body = el("div", { id: "insp-body" });

    body.append(el("p", { className: "insp-hint",
      textContent: `Read with ${r.extraction_method || "?"}. Check every field against the PDF and fix anything misread. Changed fields turn yellow.` }),
      el("a", { href: `/api/inspections/${r.report_id}/file`, target: "_blank", textContent: "Open the PDF ↗" }));

    for (const [key, label] of Object.entries(r.fields)) {
      const value = (r.data || {})[key] ?? "";
      let input;
      if (key === "result") {
        input = el("select");
        r.results.forEach(v => input.append(el("option", { value: v, textContent: v, selected: v === value })));
      } else if (key === "defects") {
        input = el("textarea", { rows: 3, value });
      } else {
        input = el("input", { value });
      }
      const original = extracted[key] ?? "";
      input.oninput = input.onchange = () => input.classList.toggle("changed", input.value !== original);
      input.oninput();
      inputs[key] = input;
      body.append(el("label", { textContent: label }), input);

      if (key === "site_address") {
        const find = el("button", { className: "insp-chip", textContent: "Find this address on the map" });
        const status = el("div", { className: "insp-hint" });
        find.onclick = async () => {
          status.textContent = "Searching…";
          status.classList.remove("insp-warn");
          try {
            const res = await fetch("/api/inspections/geocode", { method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ address: input.value }) });
            const hit = await res.json();
            if (!res.ok) throw new Error(hit.detail || "Not found");
            placeDraft(hit.lon, hit.lat);
            status.textContent = "Found: " + hit.label;
          } catch (e) {
            status.textContent = e.message;
            status.classList.add("insp-warn");
          }
        };
        body.append(find, status);
        if (r.candidates && r.candidates.length) {
          body.append(el("div", { className: "insp-hint", textContent: "Other addresses in the PDF (click to use):" }));
          r.candidates.forEach(c => body.append(el("span", { className: "insp-chip", textContent: c,
            onclick: () => { input.value = c; input.oninput(); find.click(); } })));
        }
        body.append(el("p", { className: "insp-hint",
          textContent: "The orange pin is where the report will be shown. Drag it onto the right building if needed." }));
      }
    }

    if (r.lat != null && r.lon != null) {
      placeDraft(r.lon, r.lat);
    } else {
      body.prepend(el("p", { className: "insp-hint insp-warn",
        textContent: "The address could not be found automatically. Fix it and press “Find this address”, or drag the pin." }));
      const c = map.getCenter();
      placeDraft(c.lng, c.lat, false);
    }

    const accept = el("button", { id: "insp-accept", textContent: "Accept & show on map" });
    const reject = el("button", { textContent: "Reject" });
    accept.onclick = async () => {
      const pos = draftMarker.getLngLat();
      const fields = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
      accept.disabled = true;
      try {
        const res = await fetch(`/api/inspections/${r.report_id}/approve`, { method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields, lat: pos.lat, lon: pos.lng }) });
        if (!res.ok) throw new Error((await res.json()).detail || "Saving failed");
        closeReview();
        await loadPins();
        loadPending();
      } catch (e) {
        alert(e.message);
        accept.disabled = false;
      }
    };
    reject.onclick = async () => {
      if (!confirm("Reject this report? It will not be shown on the map.")) return;
      await fetch(`/api/inspections/${r.report_id}/reject`, { method: "POST" });
      closeReview();
      loadPending();
    };

    review.replaceChildren(
      el("header", {}, el("span", { textContent: "Check report: " + r.original_name }),
        el("button", { textContent: "×", title: "Close (keeps it waiting for review)", onclick: closeReview })),
      body,
      el("footer", {}, reject, accept));
    review.classList.remove("hidden");
  }

  // ---------- pins for accepted reports
  let pins = [];
  function popupFor(p) {
    const rows = [["Type", p.inspection_type], ["Equipment", p.equipment], ["Address", p.site_address],
      ["Inspected", p.inspection_date], ["Next due", p.next_inspection_date], ["Result", p.result],
      ["Defects", p.defects], ["Company", p.company_name], ["Inspector", p.inspector], ["Report no.", p.report_number]];
    const dl = el("dl");
    rows.filter(([, v]) => v).forEach(([k, v]) => dl.append(el("dt", { textContent: k }), el("dd", { textContent: v })));
    const overdue = p.next_inspection_date && p.next_inspection_date < new Date().toISOString().slice(0, 10);
    return el("div", { className: "insp-pop" },
      el("h3", { textContent: p.site_name || p.site_address || p.original_name }),
      overdue ? el("div", { className: "insp-warn", textContent: "Next inspection is overdue" }) : "",
      dl,
      el("a", { href: `/api/inspections/${p.report_id}/file`, target: "_blank",
        textContent: "📎 " + p.original_name }));
  }

  async function loadPins() {
    try {
      const geo = await (await fetch("/api/inspections")).json();
      pins.forEach(m => m.remove());
      pins = geo.features.map(f => new maplibregl.Marker({ color: COLORS[f.properties.result] || COLORS.unbekannt })
        .setLngLat(f.geometry.coordinates)
        .setPopup(new maplibregl.Popup({ offset: 25, maxWidth: "320px" }).setDOMContent(popupFor(f.properties)))
        .addTo(map));
    } catch { /* server not ready */ }
  }

  loadPins();
  loadPending();
})();
