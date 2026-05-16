from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import ollama
import json
import asyncio

app = FastAPI()

# Allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple chat endpoint
@app.post("/chat")
async def chat(request: dict):
    message = request.get("message", "")
    
    # Get response from local AI
    response = ollama.chat(
        model="llama3.2:3b",
        messages=[{"role": "user", "content": message}]
    )
    
    return {"response": response["message"]["content"]}

# Real-time streaming via WebSocket
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data).get("message", "")
            
            # Stream response word by word
            response = ollama.chat(
                model="llama3.2:3b",
                messages=[{"role": "user", "content": message}],
                stream=True
            )
            
            for chunk in response:
                if 'message' in chunk and 'content' in chunk['message']:
                    await websocket.send_text(chunk['message']['content'])
            
            await websocket.send_text("[DONE]")
    except:
        pass

@app.get("/health")
async def health():
    return {"status": "Mitra AI is running!"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
