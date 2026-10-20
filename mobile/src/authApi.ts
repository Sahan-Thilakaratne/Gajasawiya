/** Auth API Client connected to Gajasaviya SQLite & Gmail Dispatcher Backend */

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  district: string;
  notifications_enabled: boolean;
  sms_alerts_enabled: boolean;
  created_at?: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: UserProfile;
}

const AUTH_API = process.env.EXPO_PUBLIC_AUTH_API ?? "http://10.0.2.2:8005";

let cachedUser: UserProfile | null = {
  id: 1,
  name: "Officer D.M. Senanayake",
  email: "gajasaviya@gmail.com",
  phone: "+94 77 123 4567",
  role: "Lead Agrarian Wildlife Officer",
  district: "Anuradhapura",
  notifications_enabled: true,
  sms_alerts_enabled: true,
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let errorMsg = `${res.status} ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.detail) errorMsg = errJson.detail;
    } catch {
      const text = await res.text();
      if (text) errorMsg = text;
    }
    throw new Error(errorMsg);
  }
  return res.json() as Promise<T>;
}

export function getCurrentUser(): UserProfile | null {
  return cachedUser;
}

export function setCurrentUser(user: UserProfile | null) {
  cachedUser = user;
}

export async function registerUser(data: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  district?: string;
  role?: string;
}): Promise<AuthResponse> {
  const res = await jsonFetch<AuthResponse>(`${AUTH_API}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.user) {
    setCurrentUser(res.user);
  }
  return res;
}

export async function loginUser(data: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await jsonFetch<AuthResponse>(`${AUTH_API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.user) {
    setCurrentUser(res.user);
  }
  return res;
}

export async function requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
  return jsonFetch<{ success: boolean; message: string }>(`${AUTH_API}/api/auth/forgot-password/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export async function resetPasswordWithOtp(data: {
  email: string;
  otp_code: string;
  new_password: string;
}): Promise<{ success: boolean; message: string }> {
  return jsonFetch<{ success: boolean; message: string }>(`${AUTH_API}/api/auth/forgot-password/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function fetchProfile(email: string): Promise<UserProfile> {
  const res = await jsonFetch<{ success: boolean; user: UserProfile }>(`${AUTH_API}/api/auth/profile/${encodeURIComponent(email)}`);
  if (res.user) {
    setCurrentUser(res.user);
  }
  return res.user;
}

export async function updateProfile(
  email: string,
  data: Partial<UserProfile>
): Promise<UserProfile> {
  const res = await jsonFetch<{ success: boolean; user: UserProfile }>(
    `${AUTH_API}/api/auth/profile/${encodeURIComponent(email)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );
  if (res.user) {
    setCurrentUser(res.user);
  }
  return res.user;
}
