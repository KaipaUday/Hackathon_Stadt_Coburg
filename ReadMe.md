CITYTWIN COBURG

Setup

1. Start the database:
   docker start citydb

2. Install Ollama from ollama.com, open it, then run:
   ollama pull qwen2.5:7b

3. Install the Python packages:
   pip3 install fastapi uvicorn python-multipart ollama "psycopg[binary]"

4. Set the database password (this lasts for the current Terminal window):
   export DB_PASSWORD="your-agent-reader-password"

5. From the citytwin-web folder, start the server:
   uvicorn server:app --reload --port 8000

6. Open http://localhost:8000 in your browser.

Keep the Terminal window from step 5 open while you use the app. Stop the server with Ctrl+C.