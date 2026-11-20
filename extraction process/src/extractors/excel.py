from pathlib import Path

def extract(path):
    if Path(path).suffix.lower() == ".xls":
        import pandas as pd
        book = pd.ExcelFile(path)
        return {"method": "pandas_xlrd", "sheets": {
            name: pd.read_excel(book, sheet_name=name, header=None, dtype=str)
                     .fillna("").values.tolist() for name in book.sheet_names}}
    from openpyxl import load_workbook
    wb = load_workbook(path, read_only=True, data_only=True)
    try:
        sheets = {ws.title: [list(row) for row in ws.iter_rows(values_only=True)
                             if any(v is not None for v in row)] for ws in wb.worksheets}
    finally:
        wb.close()
    return {"method": "openpyxl", "sheets": sheets}
