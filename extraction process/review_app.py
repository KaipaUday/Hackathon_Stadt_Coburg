import streamlit as st
import pandas as pd
from sqlalchemy import text
from src.database import SessionLocal

st.set_page_config(page_title="Document Review", layout="wide")
st.title("Document Extractor — Review Queue")

with SessionLocal() as db:
    rows = db.execute(text("""
        SELECT f.file_id, f.original_name, f.mime_type, f.size_bytes,
               dm.document_type, dm.title, dm.review_status,
               ej.status AS extraction_status
        FROM files f
        LEFT JOIN document_metadata dm ON dm.file_id=f.file_id
        LEFT JOIN LATERAL (
            SELECT status FROM extraction_jobs
            WHERE file_id=f.file_id ORDER BY job_id DESC LIMIT 1
        ) ej ON TRUE
        ORDER BY f.file_id DESC
    """)).mappings().all()

if not rows:
    st.info("No files yet. Run python main.py run")
    st.stop()

df = pd.DataFrame([dict(r) for r in rows])
st.metric("Registered files", len(df))
st.dataframe(df, use_container_width=True, hide_index=True)
fid = st.selectbox("Select file ID", df.file_id.tolist())

with SessionLocal() as db:
    item = db.execute(text("""
        SELECT f.*, dm.document_type, dm.title, dm.review_status
        FROM files f LEFT JOIN document_metadata dm ON dm.file_id=f.file_id
        WHERE f.file_id=:fid
    """), {"fid": fid}).mappings().one()
    extracted = db.execute(text("""
        SELECT page_number, content FROM extracted_text
        WHERE file_id=:fid ORDER BY page_number NULLS FIRST, extraction_id
    """), {"fid": fid}).mappings().all()

st.subheader(item["original_name"])
st.caption(f"SHA-256: {item['sha256']} | MIME: {item['mime_type']}")
title = st.text_input("Document title", item["title"] or "")
categories = ["unknown","architectural","technical","administrative","maintenance",
              "energy","safety","building_information","sensor","general"]
current = item["document_type"] if item["document_type"] in categories else "unknown"
dtype = st.selectbox("Document category", categories, index=categories.index(current))

if st.button("Save metadata"):
    with SessionLocal.begin() as db:
        db.execute(text("""
            UPDATE document_metadata SET title=:title, document_type=:dtype
            WHERE file_id=:fid
        """), {"title": title, "dtype": dtype, "fid": fid})
        db.execute(text("""
            INSERT INTO document_audit(file_id,action,details)
            VALUES (:fid,'metadata_edited',jsonb_build_object('title',:title,'document_type',:dtype))
        """), {"fid": fid, "title": title, "dtype": dtype})
    st.success("Saved.")

st.subheader("Extracted text")
for i, page in enumerate(extracted):
    with st.expander(f"Page {page['page_number'] or 'content'}"):
        st.text_area("Text", page["content"], height=220, key=f"p_{fid}_{i}")

if st.button("Approve document metadata"):
    with SessionLocal.begin() as db:
        db.execute(text("""
            UPDATE document_metadata SET review_status='approved',
                reviewed_at=now(), reviewed_by='local_reviewer'
            WHERE file_id=:fid
        """), {"fid": fid})
        db.execute(text("""
            INSERT INTO document_audit(file_id,action,performed_by)
            VALUES (:fid,'metadata_approved','local_reviewer')
        """), {"fid": fid})
    st.success("Metadata approved.")
