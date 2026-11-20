
from docx import Document
from pathlib import Path


def extract(path):
    path = Path(path)

    doc = Document(path)

    parts = []

    # Extract paragraphs in document order
    for paragraph in doc.paragraphs:
        content = paragraph.text.strip()
        if content:
            parts.append(content)

    # Extract tables
    for table_number, table in enumerate(doc.tables, 1):
        parts.append(f"\nTable {table_number}:")

        for row in table.rows:
            cells = [
                cell.text.strip().replace("\n", " ")
                for cell in row.cells
            ]
            parts.append("\t".join(cells))

    return {
        "method": "python-docx",
        "content": "\n".join(parts)
    }
