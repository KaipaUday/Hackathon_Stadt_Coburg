
from pathlib import Path


def extract(path):
    from openpyxl import load_workbook

    path = Path(path)

    # Open the file as a binary stream because stored files
    # use hash-based filenames without their original extensions.
    with path.open("rb") as file_obj:
        wb = load_workbook(
            file_obj,
            read_only=True,
            data_only=True
        )

        try:
            sheets = {
                ws.title: [
                    list(row)
                    for row in ws.iter_rows(values_only=True)
                    if any(v is not None for v in row)
                ]
                for ws in wb.worksheets
            }
        finally:
            wb.close()

    return {
        "method": "openpyxl",
        "sheets": sheets
    }
