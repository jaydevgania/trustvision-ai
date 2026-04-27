from fastapi import FastAPI
import cv2
import numpy as np
from ultralytics import YOLO

app = FastAPI()

# 🔥 Load YOLO model
model = YOLO("yolov8n.pt")

# 🎥 Replace with your CCTV file path
VIDEO_SOURCE = "cctv.mp4"  # or 0 for webcam

cap = cv2.VideoCapture(VIDEO_SOURCE)

prev_gray = None

def analyze_frame():
    global prev_gray

    ret, frame = cap.read()
    if not ret:
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        return None

    # Resize for speed
    frame = cv2.resize(frame, (640, 480))

    # 🧠 YOLO detection
    results = model(frame, verbose=False)

    person_count = 0

    for r in results:
        for box in r.boxes:
            cls = int(box.cls[0])
            if cls == 0:  # person class
                person_count += 1

    # 🎥 Motion detection
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (21, 21), 0)

    motion = 0
    if prev_gray is not None:
        diff = cv2.absdiff(prev_gray, gray)
        thresh = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)[1]
        motion = int(np.sum(thresh) / 50000)

    prev_gray = gray

    motion = min(motion, 100)

    # 👥 Density from people count
    density = min(person_count * 5, 100)

    # 🚨 Risk logic
    severity = 1
    risk = "LOW"
    insights = []

    if density > 70:
        severity += 1
        insights.append("⚠ High crowd density")

    if motion > 60:
        severity += 1
        insights.append("⚠ High movement detected")

    if density > 80 and motion > 70:
        severity += 2
        risk = "HIGH"
        insights.append("🚨 Possible stampede / panic")

    return {
        "people_count": person_count,
        "density": density,
        "motion": motion,
        "severity": min(severity, 5),
        "risk": risk,
        "insights": insights if insights else ["Stable crowd"]
    }


@app.get("/detect")
def detect():
    data = analyze_frame()
    if data is None:
        return {
            "people_count": 0,
            "density": 0,
            "motion": 0,
            "severity": 1,
            "risk": "LOW",
            "insights": ["No video frame"]
        }
    return data


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)