# PLANET Backend API

This is the Python backend for the PLANET (Predictive Learning Approach for Non-Solar Environment Tracking) project. It uses FastAPI to serve an XGBoost machine learning model that predicts exoplanet habitability based on NASA Exoplanet Archive data.

## Features
- **Automatic Data Pipeline**: Fetches real exoplanet data using `astroquery`, splits it 75/25, and trains an XGBoost classifier on startup.
- **`/api/predict_habitability`**: A POST endpoint that accepts a `planet_id` and optional feature overrides to predict habitability.
- **`/api/get_lightcurve`**: A GET endpoint that uses `lightkurve` to fetch and plot telescope data, returning a base64 encoded image.

## How to Run Locally

### 1. Install Dependencies
You will need Python 3.8+ installed. Install the required packages using `pip`:

```bash
pip install fastapi uvicorn pandas numpy xgboost scikit-learn astroquery lightkurve matplotlib pydantic
```

### 2. Start the Server
Run the FastAPI server using Python:

```bash
python PLANET_API.py
```

Alternatively, you can run it directly with `uvicorn`:

```bash
uvicorn PLANET_API:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Test the Endpoints

Once the server says "Application startup complete" (and after it finishes training the model), you can test the API.

**Test the Prediction Endpoint (cURL):**
```bash
curl -X POST "http://localhost:8000/api/predict_habitability" \
     -H "Content-Type: application/json" \
     -d '{"planet_id": "Kepler-62 f"}'
```

**Test with Overridden Features:**
```bash
curl -X POST "http://localhost:8000/api/predict_habitability" \
     -H "Content-Type: application/json" \
     -d '{"planet_id": "Kepler-62 f", "pl_eqt": 250}'
```

**Test the Lightcurve Endpoint:**
Open your browser and navigate to:
`http://localhost:8000/api/get_lightcurve?planet_id=Kepler-62`

### 4. Interactive API Docs
FastAPI automatically generates interactive documentation. You can view and test your API directly from your browser by navigating to:
- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)
