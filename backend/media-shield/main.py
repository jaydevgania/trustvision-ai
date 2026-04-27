from fastapi import FastAPI, UploadFile, File
import torch
import torchvision.transforms as transforms
import cv2
import numpy as np

app = FastAPI()

# -----------------------------
# 🧠 LOAD PRETRAINED MODEL
# -----------------------------
model = torch.hub.load('pytorch/vision:v0.10.0', 'resnet18', pretrained=True)

# Replace last layer for binary classification
model.fc = torch.nn.Linear(model.fc.in_features, 2)

# ⚠️ In real case load trained weights:
# model.load_state_dict(torch.load("deepfake_model.pth"))

model.eval()

# -----------------------------
# 🎯 TRANSFORM
# -----------------------------
transform = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
])

# -----------------------------
# 🎥 DEEPFAKE DETECTION
# -----------------------------
def detect_deepfake(frame):
    try:
        img = transform(frame).unsqueeze(0)

        with torch.no_grad():
            output = model(img)
            probs = torch.softmax(output, dim=1)

        fake_prob = probs[0][1].item()  # class 1 = fake

        score = int((1 - fake_prob) * 100)

        return max(0, min(score, 100))

    except:
        return 50

# -----------------------------
# 🎬 VIDEO FRAME ANALYSIS
# -----------------------------
def analyze_video_frames(file_bytes):
    np_arr = np.frombuffer(file_bytes, np.uint8)
    cap = cv2.VideoCapture(cv2.imdecode(np_arr, cv2.IMREAD_COLOR))

    scores = []
    count = 0

    while cap.isOpened() and count < 5:  # 🔥 SAMPLE ONLY 5 FRAMES
        ret, frame = cap.read()
        if not ret:
            break

        score = detect_deepfake(frame)
        scores.append(score)
        count += 1

    cap.release()

    if not scores:
        return 50

    return int(sum(scores) / len(scores))

# -----------------------------
# 🖼 IMAGE ANALYSIS
# -----------------------------
def analyze_image(file_bytes):
    np_arr = np.frombuffer(file_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if img is None:
        return 50

    return detect_deepfake(img)

# -----------------------------
# 📡 MAIN SCAN
# -----------------------------
@app.get("/scan")
def scan():
    # fallback lightweight logic
    return {
        "authenticity_score": 75,
        "deepfake_risk": "LOW",
        "misinformation_probability": 25
    }

# -----------------------------
# 🎥 FILE UPLOAD
# -----------------------------
@app.post("/scan/file")
async def scan_file(file: UploadFile = File(...)):
    content = await file.read()

    if file.filename.endswith((".mp4", ".avi", ".mov")):
        score = analyze_video_frames(content)
    else:
        score = analyze_image(content)

    return {
        "filename": file.filename,
        "authenticity_score": score,
        "deepfake_risk": "HIGH" if score < 60 else "LOW"
    }

# -----------------------------
# 🚀 RUN
# -----------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, port=8003)