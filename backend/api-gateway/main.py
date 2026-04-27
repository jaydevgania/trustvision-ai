from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import requests
import asyncio
import cv2

app = FastAPI()

# -----------------------------
# 🌐 CORS (allow frontend)
# -----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# 🔌 CLIENT CONNECTIONS
# -----------------------------
clients = set()

# -----------------------------
# 🎥 VIDEO SOURCE (SYNC WITH CRISIS RADAR)
# -----------------------------
VIDEO_SOURCE = "cctv.mp4"  # or 0 for webcam / RTSP link
cap = cv2.VideoCapture(VIDEO_SOURCE)


# -----------------------------
# 🔴 WEBSOCKET
# -----------------------------
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    print("✅ Client connected")

    try:
        while True:
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        clients.remove(ws)
        print("❌ Client disconnected")


# -----------------------------
# 📡 VIDEO STREAM (MJPEG)
# -----------------------------
def generate_frames():
    while True:
        success, frame = cap.read()

        if not success:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue

        # Resize for performance
        frame = cv2.resize(frame, (640, 480))

        _, buffer = cv2.imencode(".jpg", frame)
        frame_bytes = buffer.tobytes()

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
        )


@app.get("/video")
def video_feed():
    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


# -----------------------------
# 🔁 MAIN BROADCAST LOOP
# -----------------------------
async def broadcast_loop():
    while True:
        if clients:
            try:
                # -----------------------------
                # 🔴 CROWD (YOLO)
                # -----------------------------
                crowd = requests.get(
                    "http://127.0.0.1:8001/detect",
                    timeout=2
                ).json()

                # -----------------------------
                # 🟢 MEDIA SHIELD
                # -----------------------------
                media = requests.get(
                    "http://127.0.0.1:8003/scan",
                    timeout=2
                ).json()

                # -----------------------------
                # 🟡 BIAS GUARD
                # -----------------------------
                bias = requests.post(
                    "http://127.0.0.1:8002/audit",
                    json={
                        "density": crowd.get("density", 0),
                        "motion": crowd.get("motion", 0),
                        "people_count": crowd.get("people_count", 0),
                        "media": media.get("authenticity_score", 70)
                    },
                    timeout=2
                ).json()

                # -----------------------------
                # 🔵 TRUST ENGINE
                # -----------------------------
                trust = requests.post(
                    "http://127.0.0.1:8004/score",
                    json={
                        "density": crowd.get("density", 0),
                        "motion": crowd.get("motion", 0),
                        "people_count": crowd.get("people_count", 0),
                        "media": media.get("authenticity_score", 70),
                        "bias": bias.get("bias_score", 0),
                        "misinformation_probability": media.get("misinformation_probability", 0)
                    },
                    timeout=2
                ).json()

                # -----------------------------
                # 📦 FINAL DATA
                # -----------------------------
                payload = {
                    "crowd": crowd,
                    "media": media,
                    "bias": bias,
                    "trust": trust
                }

                # -----------------------------
                # 📡 SEND TO CLIENTS
                # -----------------------------
                dead_clients = set()

                for client in clients:
                    try:
                        await client.send_json(payload)
                    except Exception:
                        dead_clients.add(client)

                # Remove disconnected clients
                for dc in dead_clients:
                    clients.remove(dc)

            except Exception as e:
                print("❌ Gateway Error:", e)

        # 🔥 Faster refresh for real-time feel
        await asyncio.sleep(1)


# -----------------------------
# 🚀 STARTUP
# -----------------------------
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(broadcast_loop())


# -----------------------------
# ▶ RUN SERVER
# -----------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)