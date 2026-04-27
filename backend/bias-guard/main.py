from fastapi import FastAPI

app = FastAPI()

@app.post("/audit")
def audit(data: dict):
    # 🔹 Inputs from other services
    density = data.get("density", 0)
    motion = data.get("motion", 0)
    people_count = data.get("people_count", 0)
    media = data.get("media", 100)

    bias_score = 0
    flags = []

    # 🧠 1. False Alarm Detection
    if density > 80 and motion < 30:
        bias_score += 25
        flags.append("⚠ High density but low movement → possible false alarm")

    # 🧠 2. Overreaction Detection
    if motion > 80 and density < 40:
        bias_score += 20
        flags.append("⚠ High motion without crowd → possible anomaly")

    # 🧠 3. Sensor Inconsistency (YOLO vs Density mismatch)
    expected_density = people_count * 5

    if abs(expected_density - density) > 30:
        bias_score += 20
        flags.append("⚠ Inconsistent crowd estimation → sensor mismatch")

    # 🧠 4. Media Influence Bias
    if media < 60:
        bias_score += 25
        flags.append("🎥 Low media authenticity influencing system")

    # 🧠 5. Extreme Condition Check
    if density > 90 and motion > 90:
        flags.append("🚨 Extreme conditions — high confidence alert (low bias)")

    # Normalize score
    bias_score = min(100, bias_score)

    # Alert threshold
    alert = bias_score > 50

    return {
        "bias_score": bias_score,
        "alert": alert,
        "flags": flags if flags else ["✅ System decisions are stable"],
        "confidence_level": "LOW" if bias_score > 60 else "HIGH"
    }


# 🚀 RUN SERVER
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8002)