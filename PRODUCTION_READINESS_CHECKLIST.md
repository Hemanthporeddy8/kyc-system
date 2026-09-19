# 🛡️ Production Readiness & Backend Security Guide
> **Audience:** Engineering Team (Frontend, Backend, DevOps, Security)  
> **Purpose:** Critical security fixes and architectural guidelines required before launching the Face KYC & Driver Verification module to the public.

---

## 📌 Executive Summary

The current module provides a **client-side capture interface** with MediaPipe landmark tracking, dynamic color flashing, 128-D embedding extraction, and Tesseract.js OCR.

⚠️ **Golden Security Rule:**  
**The frontend client is untrusted.** The browser/client is strictly an input/sensor device. The **backend server must be the sole authority** for verifying identity, comparing faces, and marking drivers as active.

---

## 🚨 Top 4 Critical Fixes Required Before Public Launch

### 1. 🛑 Never Trust Client-Side `"verified: true"`
* **The Vulnerability:**  
  If the frontend sends `{ "verified": true, "similarity": 92.4 }` and your backend marks the driver active, anyone can bypass verification using Postman, curl, or Chrome DevTools (F12) without ever opening their camera.
* **The Fix (Server-Side Verification):**  
  1. Frontend captures the live selfie and uploads it to Cloudinary.
  2. Frontend sends the Cloudinary `public_id` or secure image URL to your backend:
     ```json
     POST /api/v1/driver/verify-liveness
     {
       "challengeSessionId": "sess_89420abf-7123",
       "livePhotoUrl": "https://res.cloudinary.com/your-cloud/image/upload/v1234/live_driver.jpg"
     }
     ```
  3. **Your backend retrieves the stored official reference photo** from the database for that authenticated driver (identified by their JWT).
  4. **Your backend performs the 1:1 facial comparison** using a backend biometric library (e.g., Python `face_recognition`, `deepface`, or AWS Rekognition / Google Cloud Vision API).
  5. The backend sets `status = "VERIFIED"` only if the backend match passes.

---

### 2. ☁️ Protect Cloudinary Uploads (Disable Unsigned Presets)
* **The Vulnerability:**  
  Using unsigned upload presets exposes your Cloudinary cloud name and preset name in client-side JavaScript. Malicious users can extract these and upload gigabytes of spam or illicit files, exhausting your storage and bandwidth quotas.
* **The Fix (Signed Backend Uploads):**  
  * **Approach A (Recommended):** The driver uploads the image directly to your own backend API (`/api/v1/driver/upload-face`), and your server uploads it to Cloudinary using your private API secret.
  * **Approach B (Signed Direct Upload):** The frontend asks your backend for a one-time signature:
    ```
    GET /api/v1/media/cloudinary-signature
    ```
    Your server returns `{ signature, timestamp, apiKey }`. The client uploads to Cloudinary with that specific signature.

---

### 3. ⏱️ Prevent Video Replay Attacks (One-Time Challenge Nonce)
* **The Vulnerability:**  
  A driver can complete verification once, save their photo, and write a script to resend that same photo URL to your API every day while someone else drives their vehicle.
* **The Fix (Server-Generated Challenge Nonce):**  
  1. When the driver taps **"Go Online"**, frontend calls:
     ```
     POST /api/v1/driver/start-verification
     ```
  2. Backend responds with a short-lived (60-second) session token and a random challenge:
     ```json
     {
       "challengeSessionId": "sess_89420abf-7123",
       "requiredGesture": "BLINK_TWICE",
       "expiresAt": 1726742460
     }
     ```
  3. Frontend presents the challenge and submits the photo tied to `challengeSessionId`.
  4. Backend verifies that:
     * The `challengeSessionId` is valid and has not expired.
     * The `challengeSessionId` has **never been used before** (single-use / replay-proof).
     * Immediately invalidate the token upon completion.

---

### 4. 📱 Client Environment: Mobile App vs Web Browser
* **The Vulnerability on Desktop Browsers:**  
  On standard desktop browsers (Chrome/Firefox/Edge on Windows/macOS), users can easily install **OBS Virtual Camera** or **ManyCam** to feed pre-recorded videos or AI deepfakes into `navigator.mediaDevices.getUserMedia()`.
* **The Fix:**  
  * **For High-Stakes Driver Operations:** Enforce that verification takes place inside your official **Mobile Application** (React Native, Flutter, Kotlin/Swift, or WebView with strict camera permissions).
  * **Native Hardware Attestation:** On mobile, use **Google Play Integrity API** (Android) and **DeviceCheck / App Attest** (iOS) to detect rooted devices, emulators, and fake camera hardware.

---

## 🏗️ Recommended Architecture & Data Flow

```
[ Driver Mobile App / Frontend ]
               │
               ▼ 1. Request verification challenge
   [ Backend API: /start-verification ]
               │
               ▼ 2. Returns one-time Nonce (valid 60s)
[ Driver Frontend ]
   ├── Runs MediaPipe & Dynamic Color Flash locally for UX
   └── Captures live face photo
               │
               ▼ 3. Uploads image securely
       [ Cloudinary ]  <─── (Signed via Backend API Secret)
               │
               ▼ 4. Submits Cloudinary URL + Nonce
   [ Backend API: /complete-verification ]
               │
               ├─► A. Invalidate Nonce (prevent replay)
               ├─► B. Fetch Driver Reference Photo from Database
               ├─► C. Run Server-Side 1:1 Face Match
               └─► D. If Match Score ≥ Threshold:
                       Update Driver DB: is_online = true
```

---

## 🔒 Biometric Privacy & Legal Compliance

Before launching publicly, ensure compliance with applicable privacy regulations (e.g., GDPR, BIPA, DPDP Act):
- [ ] **Biometric Consent Disclosure:** Display an explicit consent checkbox informing the user that facial geometry data is being collected for identity verification.
- [ ] **Data Retention Policy:** Define how long live capture selfies are kept (e.g., auto-purge live verification captures after 30 days; retain only the primary registered reference image).
- [ ] **Encryption at Rest:** Ensure reference photos and biometric vectors stored in your database are encrypted using AES-256.

---

## ✅ Public Launch Checklist

| Task | Responsible Team | Status |
| :--- | :---: | :---: |
| Move final verification decision to backend API | Backend | ⬜ Pending |
| Implement 1-time challenge session/nonce with expiration | Backend | ⬜ Pending |
| Secure Cloudinary uploads with server-side signatures | Backend / DevOps | ⬜ Pending |
| Remove any raw Cloudinary API secrets from frontend code | Frontend | ⬜ Pending |
| Restrict driver onboarding/verification to official Mobile App | Mobile / Frontend | ⬜ Pending |
| Add user biometric consent notice before opening camera | Frontend / Legal | ⬜ Pending |
