from fastapi import FastAPI

app = FastAPI()

def compute_trust(density, motion, media_score, bias_score):
    """
    Weighted trust calculation:
    Higher density/motion/bias reduce trust
    Higher media authenticity increases trust
    """

    trust = (
        (100 - density) * 0.25 +
        (100 - motion) * 0.25 +
        media_score * 0.25 +
        (100 - bias_score) * 0.25
    )

    return round(max(0, min(100, trust)), 2)


@app.post("/score")
def score(data: dict):
    # 🔹 Inputs
    density = data.get("density", 0)
    motion = data.get("motion", 0)
    people_count = data.get("people_count", 0)
    media_score = data.get("media", 75)
    bias_score = data.get("bias", 0)
    misinformation = data.get("misinformation_probability", 0)

    explanation = []
    actions = []
    risk_level = "LOW"

    # -----------------------------
    # 🚨 CROWD RISK ANALYSIS
    # -----------------------------
    if density > 85:
        explanation.append("🚨 Extreme crowd density detected")
        actions.append("Deploy crowd control police")
        risk_level = "HIGH"

    elif density > 70:
        explanation.append("⚠ High crowd density")

    if motion > 75:
        explanation.append("⚠ Panic-like movement detected")
        actions.append("Send rapid response team")
        risk_level = "HIGH"

    elif motion > 60:
        explanation.append("⚠ Elevated movement")

    if density > 90 and motion > 80:
        explanation.append("🚨 Stampede risk critical")
        actions.extend([
            "🚑 Call Ambulance",
            "🚒 Call Fire Brigade",
            "👮 Immediate police intervention"
        ])
        risk_level = "CRITICAL"

    # -----------------------------
    # 🎥 MEDIA ANALYSIS
    # -----------------------------
    if media_score < 60:
        explanation.append("🎥 Low media authenticity detected")
        actions.append("Verify media sources before escalation")

    if misinformation > 50:
        explanation.append("📰 High misinformation probability")
        actions.append("Flag content for manual review")

    # -----------------------------
    # ⚖ BIAS VALIDATION
    # -----------------------------
    if bias_score > 50:
        explanation.append("⚖ AI decision inconsistency detected")
        actions.append("Require human verification")

    # -----------------------------
    # 👥 CROWD CONSISTENCY CHECK
    # -----------------------------
    expected_density = people_count * 5
    if abs(expected_density - density) > 30:
        explanation.append("⚠ Sensor mismatch detected")
        actions.append("Recalibrate crowd estimation")

    # -----------------------------
    # 🧠 FINAL TRUST SCORE
    # -----------------------------
    trust_score = compute_trust(
        density,
        motion,
        media_score,
        bias_score
    )

    # Adjust risk if trust is too low
    if trust_score < 40 and risk_level != "CRITICAL":
        risk_level = "HIGH"
    elif trust_score < 60 and risk_level == "LOW":
        risk_level = "MEDIUM"

    # -----------------------------
    # 📦 RESPONSE
    # -----------------------------
    return {
        "trust_score": trust_score,
        "risk_level": risk_level,
        "explanation": explanation if explanation else ["✅ System stable"],
        "recommended_actions": actions if actions else ["No immediate action required"]
    }


# 🚀 RUN SERVER
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8004)