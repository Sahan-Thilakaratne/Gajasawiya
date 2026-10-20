from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import Optional
import sqlite3
import datetime
import secrets
import sys
from pathlib import Path

# Add root of auth-service to path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from db import init_db, hash_password, send_email, DB_PATH

app = FastAPI(
    title="Gajasaviya Auth & Profile Service",
    description="SQLite-backed Authentication, Profile Management & Gmail Notification Dispatcher",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB tables on startup
init_db()

# --- Request / Response Models ---

class RegisterRequest(BaseModel):
    name: str
    email: str
    phone: Optional[str] = ""
    password: str
    district: Optional[str] = "Anuradhapura"
    role: Optional[str] = "Wildlife Field Officer / Resident"

class LoginRequest(BaseModel):
    email: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    otp_code: str
    new_password: str

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    district: Optional[str] = None
    role: Optional[str] = None
    notifications_enabled: Optional[bool] = None
    sms_alerts_enabled: Optional[bool] = None

# --- Helper DB getter ---
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

# --- Endpoints ---

@app.get("/health")
def health():
    return {"status": "ok", "service": "Gajasaviya Auth Service", "db": "SQLite"}

@app.post("/api/auth/register")
def register(req: RegisterRequest):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    email_clean = req.email.strip().lower()
    cur.execute("SELECT id FROM users WHERE email = ?", (email_clean,))
    if cur.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="An account with this email address already exists.")

    pw_hash = hash_password(req.password)
    cur.execute("""
    INSERT INTO users (name, email, phone, password_hash, district, role)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (req.name.strip(), email_clean, req.phone.strip() if req.phone else "", pw_hash, req.district, req.role))
    conn.commit()
    user_id = cur.lastrowid
    conn.close()

    # Send Welcome Email via Gmail
    email_html = f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #F6F9F6; padding: 24px; color: #1B382B;">
      <div style="max-width: 560px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; border: 1px solid #C8E6C9; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="background: #0D2818; padding: 24px; text-align: center;">
          <h1 style="color: #81C784; margin: 0; font-size: 24px; letter-spacing: 2px;">GAJASAVIYA</h1>
          <p style="color: #E8F5E9; margin: 4px 0 0 0; font-size: 13px;">Human-Elephant Coexistence Early Warning Network</p>
        </div>
        <div style="padding: 28px;">
          <h2 style="color: #1B5E20; margin-top: 0; font-size: 18px;">Welcome, {req.name}!</h2>
          <p style="line-height: 1.6; color: #333333;">Your registration for the Gajasaviya Early Warning System has been successfully activated.</p>
          
          <div style="background: #E8F5E9; border-left: 4px solid #2E7D32; padding: 14px; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0; font-size: 13px; color: #1B5E20;"><strong>Registered Account:</strong> {email_clean}</p>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #1B5E20;"><strong>Assigned Sector:</strong> {req.district}</p>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #1B5E20;"><strong>Role:</strong> {req.role}</p>
          </div>

          <p style="font-size: 13px; color: #555555; line-height: 1.5;">You can now monitor live telemetry, track wild herds with Extended Kalman Filter estimation, and receive priority emergency alerts.</p>
          
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #E0E0E0; font-size: 11px; color: #888888; text-align: center;">
            <p style="margin: 0;">Department of Wildlife Conservation Hotline: <strong>1992</strong></p>
            <p style="margin: 4px 0 0 0;">Sri Lanka Wildlife Agrarian Safety Initiative</p>
          </div>
        </div>
      </div>
    </div>
    """
    send_email(email_clean, "Welcome to Gajasaviya Early Warning Network", email_html)

    return {
        "success": True,
        "message": "Account created successfully",
        "user": {
            "id": user_id,
            "name": req.name,
            "email": email_clean,
            "phone": req.phone,
            "district": req.district,
            "role": req.role,
        }
    }

@app.post("/api/auth/login")
def login(req: LoginRequest):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    email_clean = req.email.strip().lower()
    pw_hash = hash_password(req.password)

    cur.execute("""
    SELECT id, name, email, phone, role, district, notifications_enabled, sms_alerts_enabled, created_at 
    FROM users 
    WHERE email = ? AND password_hash = ?
    """, (email_clean, pw_hash))
    user = cur.fetchone()
    conn.close()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    # Send Login Notification Email
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    email_html = f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #F6F9F6; padding: 24px;">
      <div style="max-width: 500px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; border: 1px solid #C8E6C9;">
        <div style="background: #0D2818; padding: 20px; text-align: center;">
          <h2 style="color: #81C784; margin: 0; font-size: 20px;">GAJASAVIYA</h2>
          <p style="color: #E8F5E9; margin: 2px 0 0 0; font-size: 12px;">Security & Sign-in Notice</p>
        </div>
        <div style="padding: 24px;">
          <p style="margin-top: 0; color: #333;">Hello <strong>{user['name']}</strong>,</p>
          <p style="color: #555; line-height: 1.5; font-size: 13px;">Your Gajasaviya account was signed into on <strong>{now_str}</strong> from the mobile application.</p>
          <div style="background: #F1F8E9; padding: 12px; border-radius: 6px; font-size: 12px; color: #2E7D32;">
            If this was you, no action is required. If you did not sign in, please reset your password immediately in the app.
          </div>
        </div>
      </div>
    </div>
    """
    send_email(email_clean, "Gajasaviya Login Notification", email_html)

    return {
        "success": True,
        "token": f"token_{secrets.token_hex(16)}",
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "phone": user["phone"],
            "role": user["role"],
            "district": user["district"],
            "notifications_enabled": bool(user["notifications_enabled"]),
            "sms_alerts_enabled": bool(user["sms_alerts_enabled"]),
            "created_at": user["created_at"],
        }
    }

@app.post("/api/auth/forgot-password/request")
def forgot_password_request(req: ForgotPasswordRequest):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    email_clean = req.email.strip().lower()
    cur.execute("SELECT id, name FROM users WHERE email = ?", (email_clean,))
    user = cur.fetchone()

    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="No registered account found with this email address.")

    user_name = user[1]
    # Generate secure 6-digit OTP code
    otp = f"{secrets.randbelow(900000) + 100000}"
    expires_at = datetime.datetime.now() + datetime.timedelta(minutes=15)

    cur.execute("""
    INSERT INTO otp_codes (email, code, purpose, expires_at)
    VALUES (?, ?, 'forgot_password', ?)
    """, (email_clean, otp, expires_at.strftime("%Y-%m-%d %H:%M:%S")))
    conn.commit()
    conn.close()

    # Send OTP Email
    email_html = f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #F6F9F6; padding: 24px;">
      <div style="max-width: 500px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; border: 1px solid #C8E6C9; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="background: #0D2818; padding: 20px; text-align: center;">
          <h2 style="color: #81C784; margin: 0; font-size: 20px;">GAJASAVIYA</h2>
          <p style="color: #E8F5E9; margin: 2px 0 0 0; font-size: 12px;">Password Recovery Code</p>
        </div>
        <div style="padding: 26px; text-align: center;">
          <p style="margin-top: 0; color: #333; font-size: 14px;">Hello <strong>{user_name}</strong>,</p>
          <p style="color: #555; font-size: 13px; line-height: 1.5;">You requested a password reset for your Gajasaviya account. Use the 6-digit verification code below:</p>
          
          <div style="background: #E8F5E9; border: 2px dashed #2E7D32; padding: 16px; border-radius: 8px; margin: 20px auto; display: inline-block;">
            <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1B5E20;">{otp}</span>
          </div>

          <p style="font-size: 12px; color: #777; margin-top: 10px;">This passcode expires in <strong>15 minutes</strong>. Do not share this code with anyone.</p>
        </div>
      </div>
    </div>
    """
    send_email(email_clean, f"{otp} is your Gajasaviya password reset code", email_html)

    return {
        "success": True,
        "message": f"A 6-digit verification code has been dispatched to {email_clean}.",
    }

@app.post("/api/auth/forgot-password/reset")
def forgot_password_reset(req: ResetPasswordRequest):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    email_clean = req.email.strip().lower()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Check OTP
    cur.execute("""
    SELECT id FROM otp_codes 
    WHERE email = ? AND code = ? AND purpose = 'forgot_password' AND used = 0 AND expires_at > ?
    ORDER BY id DESC LIMIT 1
    """, (email_clean, req.otp_code.strip(), now_str))
    otp_row = cur.fetchone()

    if not otp_row:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid or expired verification code.")

    # Mark OTP as used
    cur.execute("UPDATE otp_codes SET used = 1 WHERE id = ?", (otp_row[0],))

    # Update Password
    pw_hash = hash_password(req.new_password)
    cur.execute("UPDATE users SET password_hash = ? WHERE email = ?", (pw_hash, email_clean))
    conn.commit()
    conn.close()

    # Send confirmation email
    email_html = f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #F6F9F6; padding: 24px;">
      <div style="max-width: 500px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; border: 1px solid #C8E6C9;">
        <div style="background: #0D2818; padding: 20px; text-align: center;">
          <h2 style="color: #81C784; margin: 0; font-size: 20px;">GAJASAVIYA</h2>
          <p style="color: #E8F5E9; margin: 2px 0 0 0; font-size: 12px;">Password Reset Successful</p>
        </div>
        <div style="padding: 24px;">
          <p style="color: #333; font-size: 14px;">Your Gajasaviya password has been updated successfully.</p>
          <p style="color: #555; font-size: 13px;">You can now log in using your new credentials.</p>
        </div>
      </div>
    </div>
    """
    send_email(email_clean, "Gajasaviya Password Successfully Updated", email_html)

    return {
        "success": True,
        "message": "Password updated successfully. You can now log in."
    }

@app.get("/api/auth/profile/{email}")
def get_profile(email: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    email_clean = email.strip().lower()
    cur.execute("""
    SELECT id, name, email, phone, role, district, notifications_enabled, sms_alerts_enabled, created_at 
    FROM users 
    WHERE email = ?
    """, (email_clean,))
    user = cur.fetchone()
    conn.close()

    if not user:
        raise HTTPException(status_code=404, detail="User profile not found.")

    return {
        "success": True,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "phone": user["phone"],
            "role": user["role"],
            "district": user["district"],
            "notifications_enabled": bool(user["notifications_enabled"]),
            "sms_alerts_enabled": bool(user["sms_alerts_enabled"]),
            "created_at": user["created_at"],
        }
    }

@app.put("/api/auth/profile/{email}")
def update_profile(email: str, req: UpdateProfileRequest):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    email_clean = email.strip().lower()
    cur.execute("SELECT id FROM users WHERE email = ?", (email_clean,))
    user = cur.fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="User profile not found.")

    fields = []
    vals = []

    if req.name is not None:
        fields.append("name = ?")
        vals.append(req.name.strip())
    if req.phone is not None:
        fields.append("phone = ?")
        vals.append(req.phone.strip())
    if req.district is not None:
        fields.append("district = ?")
        vals.append(req.district.strip())
    if req.role is not None:
        fields.append("role = ?")
        vals.append(req.role.strip())
    if req.notifications_enabled is not None:
        fields.append("notifications_enabled = ?")
        vals.append(1 if req.notifications_enabled else 0)
    if req.sms_alerts_enabled is not None:
        fields.append("sms_alerts_enabled = ?")
        vals.append(1 if req.sms_alerts_enabled else 0)

    if fields:
        vals.append(email_clean)
        query = f"UPDATE users SET {', '.join(fields)} WHERE email = ?"
        cur.execute(query, tuple(vals))
        conn.commit()

    cur.execute("""
    SELECT id, name, email, phone, role, district, notifications_enabled, sms_alerts_enabled, created_at 
    FROM users 
    WHERE email = ?
    """, (email_clean,))
    updated = cur.fetchone()
    conn.close()

    return {
        "success": True,
        "message": "Profile updated successfully",
        "user": {
            "id": updated["id"],
            "name": updated["name"],
            "email": updated["email"],
            "phone": updated["phone"],
            "role": updated["role"],
            "district": updated["district"],
            "notifications_enabled": bool(updated["notifications_enabled"]),
            "sms_alerts_enabled": bool(updated["sms_alerts_enabled"]),
            "created_at": updated["created_at"],
        }
    }
