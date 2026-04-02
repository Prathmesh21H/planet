import io
import base64
import os
from typing import Optional, List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from astroquery.ipac.nexsci.nasa_exoplanet_archive import NasaExoplanetArchive
import lightkurve as lk
import matplotlib.pyplot as plt
import joblib

# Initialize FastAPI app
app = FastAPI(
    title="PLANET API", 
    description="Predictive Learning Approach for Non-Solar Environment Tracking API"
)

# Global variables to hold our trained model and dataset
model = "./xgboost_planet_model.joblib"
exoplanet_data = "./exoplanet_data.csv"

# Pydantic model for the incoming JSON payload
class PredictionRequest(BaseModel):
    planet_id: str
    pl_rade: Optional[float] = None
    pl_orbsmax: Optional[float] = None
    pl_eqt: Optional[float] = None
    st_teff: Optional[float] = None
    st_rad: Optional[float] = None
    st_mass: Optional[float] = None

# 1. Multi-Planet Data Pipeline & 75/25 Split
def fetch_and_train(planet_ids: List[str]):
    """
    Fetches data from NASA Exoplanet Archive, splits it 75/25, and trains the XGBoost model.
    While it accepts a list of specific IDs, it fetches a broader dataset to ensure the ML model 
    has enough data to actually train effectively, while ensuring the requested planets are available.
    """
    global model, exoplanet_data
    
    print(f"Fetching data for systems including {planet_ids}...")
    
    # Querying the 'ps' (Planetary Systems) table from NASA Exoplanet Archive
    # We filter for rows where our required features are not null
    nasa_data = NasaExoplanetArchive.query_criteria(
        table="ps",
        select="hostname,pl_name,pl_rade,pl_orbsmax,pl_eqt,st_teff,st_rad,st_mass",
        where="pl_rade IS NOT NULL AND pl_orbsmax IS NOT NULL AND pl_eqt IS NOT NULL AND st_teff IS NOT NULL AND st_rad IS NOT NULL AND st_mass IS NOT NULL"
    )
    
    df = nasa_data.to_pandas()
    
    # Drop duplicates to keep unique planets
    df = df.drop_duplicates(subset=['pl_name'])
    
    # Store the dataset globally so we can look up default values later
    exoplanet_data = df.set_index('pl_name')
    
    # Create target variable: is_habitable
    # 1 if Planet Temp is 200K-320K AND radius < 2.5 Earth radii, else 0
    df['is_habitable'] = ((df['pl_eqt'] >= 200) & (df['pl_eqt'] <= 320) & (df['pl_rade'] < 2.5)).astype(int)
    
    # Prepare features (X) and target (y)
    X = df[['pl_rade', 'pl_orbsmax', 'pl_eqt', 'st_teff', 'st_rad', 'st_mass']]
    y = df['is_habitable']
    
    # Automatically split into 75% training data and 25% testing data
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42)
    
    print(f"Training XGBoost model on {len(X_train)} samples...")
    model = xgb.XGBClassifier(use_label_encoder=False, eval_metric='logloss')
    model.fit(X_train, y_train)
    
    accuracy = model.score(X_test, y_test)
    print(f"Model trained successfully! Test Accuracy: {accuracy:.4f}")

# Run the training pipeline when the server starts
@app.on_event("startup")
def startup_event():
    global model, exoplanet_data
    # Check if the pre-trained model and dataset exist from the Jupyter Notebook
    if os.path.exists('xgboost_planet_model.joblib') and os.path.exists('exoplanet_data.csv'):
        print("Loading pre-trained model and dataset from disk...")
        model = joblib.load('xgboost_planet_model.joblib')
        df = pd.read_csv('exoplanet_data.csv')
        df = df.drop_duplicates(subset=['pl_name'])
        exoplanet_data = df.set_index('pl_name')
        print("Model and dataset loaded successfully!")
    else:
        print("Pre-trained model not found. Fetching data and training a new model...")
        fetch_and_train(["Kepler-62", "TRAPPIST-1", "Kepler-186f"])

# 2. The Frontend-to-Backend API Endpoints

@app.get("/api/systems")
def get_systems():
    """Returns a list of top systems with the most planets to populate the UI."""
    if exoplanet_data is None:
        raise HTTPException(status_code=503, detail="Data not loaded yet.")
    
    system_counts = exoplanet_data['hostname'].value_counts()
    top_systems = system_counts.head(50).index.tolist()
    
    # Ensure TRAPPIST-1 is included if available
    if "TRAPPIST-1" in exoplanet_data['hostname'].values and "TRAPPIST-1" not in top_systems:
        top_systems.insert(0, "TRAPPIST-1")
        
    return {"systems": top_systems}

@app.get("/api/system/{hostname}")
def get_system(hostname: str):
    """Returns all stars and planets in a specific system, with habitability predictions."""
    if exoplanet_data is None or model is None:
        raise HTTPException(status_code=503, detail="Model/Data not loaded yet.")
        
    sys_data = exoplanet_data[exoplanet_data['hostname'] == hostname]
    if sys_data.empty:
        raise HTTPException(status_code=404, detail="System not found.")
        
    stars = {}
    planets = []
    
    for pl_name, row in sys_data.iterrows():
        hostname = row['hostname']
        if hostname not in stars:
            stars[hostname] = {
                "name": hostname,
                "st_teff": float(row['st_teff']),
                "st_rad": float(row['st_rad']),
                "st_mass": float(row['st_mass'])
            }
            
        # Predict habitability for this planet
        features = pd.DataFrame([{
            'pl_rade': row['pl_rade'],
            'pl_orbsmax': row['pl_orbsmax'],
            'pl_eqt': row['pl_eqt'],
            'st_teff': row['st_teff'],
            'st_rad': row['st_rad'],
            'st_mass': row['st_mass']
        }])
        
        prob = float(model.predict_proba(features)[0][1])
        pred = int(model.predict(features)[0])
        
        planets.append({
            "name": pl_name,
            "pl_rade": float(row['pl_rade']),
            "pl_orbsmax": float(row['pl_orbsmax']),
            "pl_eqt": float(row['pl_eqt']),
            "is_habitable": bool(pred == 1),
            "probability": prob
        })
        
    return {
        "hostname": hostname,
        "stars": list(stars.values()),
        "planets": planets
    }

@app.get("/api/search")
def search(q: str):
    """Searches for systems, stars, and planets matching the query."""
    if exoplanet_data is None:
        raise HTTPException(status_code=503, detail="Data not loaded yet.")
    
    q = q.lower()
    
    # Find matching systems
    systems = exoplanet_data[exoplanet_data['hostname'].str.lower().str.contains(q, na=False)]['hostname'].unique().tolist()
    
    # Find matching stars
    stars_df = exoplanet_data[exoplanet_data['hostname'].str.lower().str.contains(q, na=False)]
    stars = []
    for _, row in stars_df.drop_duplicates(subset=['hostname']).iterrows():
        stars.append({"name": row['hostname'], "hostname": row['hostname']})
        
    # Find matching planets (index is pl_name)
    planets_df = exoplanet_data[exoplanet_data.index.str.lower().str.contains(q, na=False)]
    planets = []
    for pl_name, row in planets_df.iterrows():
        planets.append({"name": pl_name, "hostname": row['hostname']})
        
    return {
        "systems": systems[:10],
        "stars": stars[:10],
        "planets": planets[:10]
    }

@app.post("/api/predict_habitability")
def predict_habitability(req: PredictionRequest):
    """
    Receives a planet_id and optional modified features.
    Predicts habitability using the trained XGBoost model.
    """
    if model is None or exoplanet_data is None:
        raise HTTPException(status_code=503, detail="Model is not trained yet. Please try again in a moment.")
        
    # Look up the planet's real default values from the NASA dataset
    if req.planet_id in exoplanet_data.index:
        planet_info = exoplanet_data.loc[req.planet_id]
        default_features = {
            'pl_rade': float(planet_info['pl_rade']),
            'pl_orbsmax': float(planet_info['pl_orbsmax']),
            'pl_eqt': float(planet_info['pl_eqt']),
            'st_teff': float(planet_info['st_teff']),
            'st_rad': float(planet_info['st_rad']),
            'st_mass': float(planet_info['st_mass'])
        }
    else:
        # If the planet isn't in our dataset, the frontend MUST provide all features
        if None in [req.pl_rade, req.pl_orbsmax, req.pl_eqt, req.st_teff, req.st_rad, req.st_mass]:
            raise HTTPException(
                status_code=404, 
                detail=f"Planet '{req.planet_id}' not found in database. Please provide all feature values manually."
            )
        default_features = {}

    # Logic: Override default values with any modified values sent by the frontend
    features_used = {
        'pl_rade': req.pl_rade if req.pl_rade is not None else default_features.get('pl_rade'),
        'pl_orbsmax': req.pl_orbsmax if req.pl_orbsmax is not None else default_features.get('pl_orbsmax'),
        'pl_eqt': req.pl_eqt if req.pl_eqt is not None else default_features.get('pl_eqt'),
        'st_teff': req.st_teff if req.st_teff is not None else default_features.get('st_teff'),
        'st_rad': req.st_rad if req.st_rad is not None else default_features.get('st_rad'),
        'st_mass': req.st_mass if req.st_mass is not None else default_features.get('st_mass')
    }
    
    # Prepare input for the model
    input_df = pd.DataFrame([features_used])
    
    # Run the prediction
    prob = float(model.predict_proba(input_df)[0][1])
    pred = int(model.predict(input_df)[0])
    
    status = "Habitable" if pred == 1 else "Not Habitable"
    
    # Return formatted JSON response
    return {
        "status": status,
        "probability": round(prob, 4),
        "features_used": features_used
    }

# 3. Handling Lightkurve (Optional Endpoint)
@app.get("/api/get_lightcurve")
def get_lightcurve(planet_id: str):
    """
    Uses lightkurve to download TPF/Lightcurve data for a given planet_id.
    Returns a base64 encoded image plot for the frontend to display.
    """
    try:
        # Search for lightcurve data (trying Kepler first, then TESS)
        search_result = lk.search_lightcurve(planet_id, author="Kepler", exptime=1800)
        if len(search_result) == 0:
            search_result = lk.search_lightcurve(planet_id, author="SPOC")
            
        if len(search_result) == 0:
            raise HTTPException(status_code=404, detail=f"No lightcurve data found for {planet_id}")
            
        # Download the first result
        lc = search_result[0].download()
        
        # Plot the lightcurve
        fig, ax = plt.subplots(figsize=(10, 5))
        lc.plot(ax=ax)
        plt.title(f"Lightcurve for {planet_id}")
        plt.tight_layout()
        
        # Save plot to a base64 string instead of a file
        buf = io.BytesIO()
        plt.savefig(buf, format='png')
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        plt.close(fig)
        
        return {
            "planet_id": planet_id,
            "image_base64": f"data:image/png;base64,{img_base64}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Run the server on port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
