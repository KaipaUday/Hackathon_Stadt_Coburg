import json, os
import psycopg
import llm
DB = (f"host=localhost port=5432 dbname=citytwin "
      f"user=agent_reader password={os.environ['DB_PASSWORD']}")

def _rows(sql, params=()):
    with psycopg.connect(DB, options="-c statement_timeout=5000") as conn:
        conn.read_only = True
        cur = conn.execute(sql, params)
        cols = [c.name for c in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]

def search_buildings(keyword: str):
    return _rows(
        "SELECT building_id, name, building_type, address FROM buildings "
        "WHERE name ILIKE %s OR building_type ILIKE %s LIMIT 10",
        (f"%{keyword}%", f"%{keyword}%"))

def get_building(building_id: int):
    return _rows(
        "SELECT building_id, name, building_type, address, district, "
        "opening_hours, phone, email FROM buildings WHERE building_id = %s",
        (building_id,))

def get_open_events(building_id: int):
    return _rows(
        "SELECT event_type, description, status, created_at FROM events "
        "WHERE building_id = %s AND status <> 'closed'",
        (building_id,))

def search_inspections(keyword: str):
    k = f"%{keyword}%"
    return _rows(
        "SELECT report_id, building_id, site_address, "
        "data->>'site_name' AS site_name, data->>'inspection_type' AS inspection_type, "
        "data->>'equipment' AS equipment, data->>'inspection_date' AS inspection_date, "
        "data->>'next_inspection_date' AS next_inspection_date, data->>'result' AS result, "
        "data->>'defects' AS defects, data->>'company_name' AS company_name "
        "FROM inspection_reports WHERE status = 'approved' AND ("
        "site_address ILIKE %s OR data->>'site_name' ILIKE %s OR "
        "data->>'inspection_type' ILIKE %s OR data->>'equipment' ILIKE %s OR "
        "data->>'company_name' ILIKE %s OR "
        "data->'details'::text ILIKE %s OR raw_text ILIKE %s) "
        "ORDER BY data->>'next_inspection_date' NULLS LAST LIMIT 10",
        (k, k, k, k, k, k, k))

def get_inspection(report_id: int):
    """All data of one accepted report, including the free 'details' object
    and the start of the original PDF text."""
    return _rows(
        "SELECT report_id, original_name, building_id, data, "
        "left(raw_text, 6000) AS pdf_text "
        "FROM inspection_reports WHERE report_id = %s AND status = 'approved'",
        (report_id,))

TOOL_FUNCS = {
    "search_buildings": search_buildings,
    "get_building": get_building,
    "get_open_events": get_open_events,
    "search_inspections": search_inspections,
    "get_inspection": get_inspection,
}

TOOLS = [
    {"type": "function", "function": {"name": "search_buildings",
        "description": "Find city buildings by name or type",
        "parameters": {"type": "object",
                       "properties": {"keyword": {"type": "string"}},
                       "required": ["keyword"]}}},
    {"type": "function", "function": {"name": "get_building",
        "description": "Full details of one building by its ID",
        "parameters": {"type": "object",
                       "properties": {"building_id": {"type": "integer"}},
                       "required": ["building_id"]}}},
    {"type": "function", "function": {"name": "get_open_events",
        "description": "Open maintenance events and complaints for a building",
        "parameters": {"type": "object",
                       "properties": {"building_id": {"type": "integer"}},
                       "required": ["building_id"]}}},
    {"type": "function", "function": {"name": "search_inspections",
        "description": "Find reviewed maintenance/inspection reports (Wartung, Prüfung) by "
                       "site, address, inspection type, equipment or company. Returns dates, "
                       "next due date, result and defects",
        "parameters": {"type": "object",
                       "properties": {"keyword": {"type": "string"}},
                       "required": ["keyword"]}}},
    {"type": "function", "function": {"name": "get_inspection",
        "description": "Everything about one inspection report by its report_id: all fields, "
                       "a free 'details' object (checked devices, measured values, norms, "
                       "defects with location and deadline, ...) and the original PDF text. "
                       "Use it after search_inspections to answer detailed questions",
        "parameters": {"type": "object",
                       "properties": {"report_id": {"type": "integer"}},
                       "required": ["report_id"]}}},
]

SYSTEM = (
    "You answer questions about city buildings in Coburg using only the tools. "
    "Show the data you found. If the tools return nothing, say so. "
    "Do not invent values. Keep answers short and clear. "
    "If you give suggestions, label them as suggestions."
)

def ask(question: str) -> str:
    messages = [{"role": "system", "content": SYSTEM},
                {"role": "user", "content": question}]
    for _ in range(6):
        msg, text, calls = llm.chat(messages, tools=TOOLS)
        messages.append(msg)
        if not calls:
            return text
        for call_id, name, args in calls:
            fn = TOOL_FUNCS.get(name)
            try:
                result = fn(**args) if fn else {"error": "unknown tool"}
            except Exception as e:
                result = {"error": str(e)}
            messages.append(llm.tool_result(call_id, json.dumps(result, default=str)))
    return "Sorry, I could not finish that answer. Try asking more specifically."
