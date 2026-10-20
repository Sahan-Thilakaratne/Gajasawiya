# ml-microservice/app/train_model.py
# Generates synthetic training data and trains a Random Forest Classifier
# for the Trust-Scoring Engine (crowdsourced sighting verification)

import numpy as np
import joblib
import os
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

def generate_synthetic_data(n_samples=5000, random_state=42):
    """
    Generate synthetic training data based on realistic distributions.
    
    Features:
        F1: gps_proximity (meters) — distance between reported and device GPS
        F2: user_reputation_score (0.0 to 1.0) — historical accuracy
        F3: hardware_sensor_sync (0 or 1) — did a sensor trigger nearby?
        F4: time_of_day_weight (0.6 to 1.4) — elephant activity temporal context
    
    Label:
        1 = Genuine sighting (should be verified and broadcast)
        0 = False/inaccurate report (should be hidden from public)
    """
    np.random.seed(random_state)
    
    # === Generate GENUINE sightings (label = 1) ===
    n_genuine = int(n_samples * 0.55)  # 55% genuine
    
    # Genuine reports: user is physically close, has decent reputation, often sensor-correlated
    genuine_proximity = np.random.exponential(scale=100, size=n_genuine)  # Close proximity
    genuine_proximity = np.clip(genuine_proximity, 0, 2000)
    
    genuine_reputation = np.random.beta(5, 2, size=n_genuine)  # Skewed toward high reputation
    genuine_reputation = np.clip(genuine_reputation, 0, 1)
    
    genuine_sensor = np.random.binomial(1, 0.6, size=n_genuine)  # 60% have sensor correlation
    
    genuine_time = np.random.choice(
        [0.8, 1.0, 1.1, 1.2, 1.3],
        size=n_genuine,
        p=[0.15, 0.15, 0.2, 0.25, 0.25]  # More reports during active hours
    )
    
    genuine_labels = np.ones(n_genuine, dtype=int)
    
    # === Generate FALSE/INACCURATE sightings (label = 0) ===
    n_false = n_samples - n_genuine
    
    # False reports: user is far away, lower reputation, rarely sensor-correlated
    false_proximity = np.random.uniform(500, 5000, size=n_false)  # Further away
    
    false_reputation = np.random.beta(2, 5, size=n_false)  # Skewed toward low reputation
    false_reputation = np.clip(false_reputation, 0, 1)
    
    false_sensor = np.random.binomial(1, 0.1, size=n_false)  # Only 10% have sensor correlation
    
    false_time = np.random.choice(
        [0.6, 0.8, 1.0, 1.1, 1.2],
        size=n_false,
        p=[0.3, 0.3, 0.2, 0.1, 0.1]  # More false reports during inactive hours
    )
    
    false_labels = np.zeros(n_false, dtype=int)
    
    # === Combine datasets ===
    X = np.vstack([
        np.column_stack([genuine_proximity, genuine_reputation, genuine_sensor, genuine_time]),
        np.column_stack([false_proximity, false_reputation, false_sensor, false_time])
    ])
    
    y = np.concatenate([genuine_labels, false_labels])
    
    # Shuffle
    shuffle_idx = np.random.permutation(len(y))
    X = X[shuffle_idx]
    y = y[shuffle_idx]
    
    return X, y


def train_and_save_model():
    """Train the Random Forest model and save to disk"""
    print("=" * 60)
    print("  Gaja Saviya — Trust-Scoring Engine Model Training")
    print("=" * 60)
    print()
    
    # 1. Generate data
    print("[1/4] Generating synthetic training data (5000 samples)...")
    X, y = generate_synthetic_data(n_samples=5000)
    print(f"      Features shape: {X.shape}")
    print(f"      Genuine sightings: {sum(y == 1)}")
    print(f"      False reports: {sum(y == 0)}")
    print()
    
    # 2. Split into train/test
    print("[2/4] Splitting into train (80%) / test (20%)...")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"      Training samples: {len(X_train)}")
    print(f"      Testing samples: {len(X_test)}")
    print()
    
    # 3. Train Random Forest
    print("[3/4] Training Random Forest Classifier...")
    print("      n_estimators=100, max_depth=10, random_state=42")
    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1
    )
    model.fit(X_train, y_train)
    
    # Evaluate
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"      [OK] Model accuracy: {accuracy:.4f} ({accuracy * 100:.1f}%)")
    print()
    
    # Classification report
    feature_names = ['gps_proximity', 'user_reputation_score', 'hardware_sensor_sync', 'time_of_day_weight']
    print("      Classification Report:")
    print("      " + "-" * 50)
    report = classification_report(y_test, y_pred, target_names=['False Report', 'Genuine Sighting'])
    for line in report.split('\n'):
        print(f"      {line}")
    print()
    
    # Feature importances
    importances = model.feature_importances_
    print("      Feature Importances (for research explainability):")
    print("      " + "-" * 50)
    for name, imp in sorted(zip(feature_names, importances), key=lambda x: -x[1]):
        bar = "#" * int(imp * 40)
        print(f"      {name:30s} {imp:.4f} {bar}")
    print()
    
    # 4. Save model
    model_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'models')
    os.makedirs(model_dir, exist_ok=True)
    model_path = os.path.join(model_dir, 'rf_trust_model.pkl')
    joblib.dump(model, model_path)
    print(f"[4/4] Model saved to: {model_path}")
    print()
    print("=" * 60)
    print("  Training complete! Model ready for deployment.")
    print("=" * 60)
    
    return model, accuracy


if __name__ == '__main__':
    train_and_save_model()
