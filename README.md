# 🪐 PLANET: Predictive Learning Approach for Non-Solar Environment Tracking

[![Astro Physics](https://img.shields.io/badge/Domain-Astrophysics-blueviolet)](#)
[![Machine Learning](https://img.shields.io/badge/Engine-XGBoost-orange)](#)
[![Graphics](https://img.shields.io/badge/Graphics-React--Three--Fiber-blue)](#)

**PLANET** is an advanced astrophysical visualization and analysis platform designed to predict, classify, and render exoplanets using real-time physics and machine learning. 

By integrating data from the NASA Exoplanet Archive with a custom XGBoost habitability model, PLANET allows researchers to explore distant star systems and simulate planetary transitions with unprecedented visual fidelity.

---

## 🚀 Key Features

### 1. 🌌 Procedural Exoplanet Texture System
Every planet is unique. Our astrophysically-driven rendering engine classifies planets into 7 distinct structural categories based on their equilibrium temperature and radius:
*   **🌋 Lava Worlds**: Molten surfaces with procedural magma networks (T > 1500K).
*   **🔥 Hot Jupiters**: Thick, glowing atmospheres with Sudarsky Class IV/V characteristics.
*   **🌍 Habitable Terrestrials**: Earth-analogs with procedural continents and polar ice caps.
*   **🧊 Ice Worlds**: Fractured cryo-shell surfaces inspired by Europa and Enceladus.
*   **🪐 Gas Giants**: Zonal atmospheric banding and complex ring systems for cold giants.

### 2. 🧠 ML-Powered Habitability Analysis
*   **XGBoost Classifier**: Trained on planetary radius, orbital distance, temperature, and stellar properties.
*   **Real-time Inference**: Adjust planetary parameters (distance, size) and see the habitability probability update instantly.
*   **Zonal Mapping**: Automated rendering of the **Goldilocks Zone** (Habitable Zone) tailored to the specific luminosity of the host star.

### 3. 🔭 Interactive Solar Systems
*   **Physics Engine**: Adjust stellar temperature or planetary distance; the system automatically recalculates equilibrium temperatures ($T_{eq}$) and re-evaluates surface structures.
*   **Deep Orbit Visualization**: Realistic orbital paths and relative orbital velocities.

---

## 🛠️ Getting Started

### Prerequisites
*   **Node.js** (v18+)
*   **Python 3.9+** (with `pip`)

### 1. Setup Backend (Machine Learning & Data API)
The backend handles NASA data ingestion and XGBoost predictions.

```bash
# Navigate to project root
python -m venv venv
source venv/Scripts/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt # If missing, install: fastapi uvicorn pandas numpy xgboost scikit-learn astroquery lightkurve matplotlib joblib
python PLANET_API.py
```

### 2. Setup Frontend (3D Visualization)
```bash
npm install
npm run dev
```
Visit `http://localhost:3000` to begin your deep space exploration.

---

## 🧪 Scientific Report
For a detailed breakdown of the planetary classification logic and texture generation algorithms, refer to our [Astrophysics Implementation Report](ASTROPHYSICS_REPORT.md).

---

*Developed for the next generation of space exploration.*
