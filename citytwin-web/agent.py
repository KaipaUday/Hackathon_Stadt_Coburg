import json, os
import ollama, psycopg

MODEL = "qwen2.5:7b"
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

TOOL_FUNCS = {
    "search_buildings": search_buildings,
    "get_building": get_building,
    "get_open_events": get_open_events,
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
        reply = ollama.chat(model=MODEL, messages=messages, tools=TOOLS)
        msg = reply["message"]
        messages.append(msg)
        if not msg.get("tool_calls"):
            return msg["content"]
        for call in msg["tool_calls"]:
            fn = TOOL_FUNCS.get(call["function"]["name"])
            try:
                result = fn(**call["function"]["arguments"]) if fn else {"error": "unknown tool"}
            except Exception as e:
                result = {"error": str(e)}
            messages.append({"role": "tool",
                             "content": json.dumps(result, default=str)})
    return