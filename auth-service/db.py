import os
import smtplib
import sqlite3
import hashlib
import secrets
import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).resolve().parent / "data" / "gajasaviya_auth.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

GMAIL_USER = "gajasaviya@gmail.com"
GMAIL_PASS = "jihhrwjvigyancvx"  # App password without spaces

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # Users table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'Wildlife Field Officer',
        district TEXT DEFAULT 'Anuradhapura',
        notifications_enabled INTEGER DEFAULT 1,
        sms_alerts_enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # OTP codes table for password reset
    cur.execute("""
    CREATE TABLE IF NOT EXISTS otp_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        purpose TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        used INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    conn.commit()
    conn.close()

def hash_password(password: str) -> str:
    # SHA-256 with salt
    salt = "gajasaviya_salt_2026"
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

def send_email(to_email: str, subject: str, html_body: str) -> bool:
    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = f"Gajasaviya HEC Early Warning <{GMAIL_USER}>"
        msg["To"] = to_email
        msg["Subject"] = subject

        part = MIMEText(html_body, "html")
        msg.attach(part)

        server = smtplib.SMTP("smtp.gmail.com", 587, timeout=12)
        server.starttls()
        server.login(GMAIL_USER, GMAIL_PASS)
        server.sendmail(GMAIL_USER, [to_email], msg.as_string())
        server.quit()
        return True
    except Exception as e:
        print(f"[SMTP Error] Failed to send email to {to_email}: {e}")
        return False
