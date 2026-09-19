# Enterprise KYC Module (Client-Side / Zero-Dependency)

This folder (`enterprise-kyc/`) contains the production-grade, enterprise driver verification module modeled after Uber and Ola's verification pipelines.

It is **100% client-side** and designed for plug-and-play portability into any external application (React, Vue, Angular, React Native WebView, Flutter WebView, or standard HTML/JS) that connects to its own database.

---

## 🚀 Key Features

1. **128-Dimensional Biometric Cosine Embeddings**
   - Extracts a unit-normalized 128-D vector from MediaPipe's 478 3D facial landmarks and blendshapes.
   - Scale, tilt, and distance invariant via 3D ocular-midpoint centering and inter-canthal distance normalization.
   - Computes pure vector dot-product similarity (cosine match threshold: 82.0%).

2. **Dynamic Color Flash Anti-Spoofing (Hardware Defeat)**
   - Sequentially flashes high-luminance screen colors (Cyan, Magenta, Gold) across the screen.
   - Samples facial skin ROI reflectance before and after each flash to measure chromatic shifts $\Delta(r, g, b)$.
   - Defeats paper masks, static photos, and screen replay attacks without needing server-side AI.

3. **Client-Side ID Card OCR (Tesseract.js)**
   - Runs Tesseract.js in a background Web Worker (zero freeze to UI).
   - High-contrast grayscale binarization preprocessing.
   - Auto-extracts Document Type (Driver's License, Aadhaar, Passport, National ID), Document Number, Holder Name, and Expiry Date.

4. **Multi-Factor Driver Verification Rules**
   - Head Pose Calibration (requires yaw, pitch, and roll within $\pm 8^\circ$).
   - Real-time oval bounding & distance verification (requires 32% - 75% oval coverage).
   - Dynamic liveness challenge (blinking, head turns) + color flash anti-spoof.

---

## 📦 How to Integrate into Another App

### Option A: As Static Files / WebView (Recommended)
Copy the `enterprise-kyc/` folder directly into your frontend app's `public/` or `assets/` directory:
```
your-app/
└── public/
    └── enterprise-kyc/
        ├── index.html
        ├── styles.css
        └── app.js
```
Open it inside an `<iframe>` or Mobile WebView (`WKWebView` on iOS, `Android WebView` with camera permissions enabled).

### Option B: Exporting Verification Payloads to Your Database
When a driver successfully completes verification, `enterprise-kyc` emits a clean, serialized JSON payload via `buildPortableKycPayload()`.
Click **'Copy Full KYC Payload (JSON)'** on the Verified Online screen, or hook into the event.

```json
{
  "verified": true,
  "timestamp": "2026-09-19T14:30:00.000Z",
  "biometric": {
    "embeddingVector": [0.081, -0.045, 0.122],
    "vectorDimension": 128,
    "cosineSimilarity": 94.6,
    "antiSpoofFlashPassed": true,
    "confidenceScore": 95
  },
  "driverProfile": {
    "name": "Alex Johnson",
    "driverId": "DRV-84920",
    "status": "active"
  },
  "governmentId": {
    "docType": "DRIVING_LICENSE",
    "docNumber": "DL-0420110012345",
    "holderName": "ALEX JOHNSON",
    "expiryDate": "12/2032",
    "ocrRawText": "..."
  }
}
```

---

## 🧪 Side-by-Side Testing

Both versions are simultaneously available on your local server:
- **Version 1 (Standard MVP):** [http://localhost:3000/](http://localhost:3000/)
- **Version 2 (Enterprise Driver KYC):** [http://localhost:3000/enterprise-kyc/](http://localhost:3000/enterprise-kyc/)
