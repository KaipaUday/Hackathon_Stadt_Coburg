def extract(path):
    import extract_msg
    msg = extract_msg.Message(str(path))
    try:
        return {"method": "extract_msg", "subject": msg.subject,
                "sender": msg.sender, "to": msg.to, "cc": msg.cc,
                "date": str(msg.date) if msg.date else None,
                "body": msg.body or "",
                "attachments": [getattr(a, "longFilename", None) for a in msg.attachments]}
    finally:
        msg.close()
