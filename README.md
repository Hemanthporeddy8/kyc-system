# Driver Face KYC & Liveness Online Verification (Uber / Rapido Style)

Lightweight browser-based driver face KYC with **Active Liveness Detection** and **Backend DB Enforcement**.

---

## 🚀 How to Run

```bash
node server.js
```

Then open: **`http://localhost:3000`**

---

## 🔒 Security Architecture: How It Works

### 1. Enforced Live Check Every Time Before Going Online
- When the driver clicks **⚡ GO ONLINE** (`btnGoOnline`), it **never** directly sets the driver online.
- Instead, it triggers `openLive()`, forcing a fresh MediaPipe 3D face mesh scan and an active liveness challenge (randomized: Blink, Turn Left, Turn Right, Smile).
- Only upon passing the challenge, the client captures the live verified selfie crop and calls the secure backend.

### 2. Backend & Database Enforcement
The backend server (`server.js`) verifies and stores verification state in the database:
- **Authentication**: Checks the driver's JWT / Bearer session.
- **Rate Limiting**: Limits attempts to max 5 attempts per 10 minutes to stop brute-forcing.
- **Database Write**:
  ```sql
  UPDATE drivers
  SET last_verified_at = CURRENT_TIMESTAMP,
      verification_status = 'passed',
      is_online = 1,
      device_info = ?
  WHERE id = ?;
  ```
- **Permission Return**: Returns `{ "allowed": true }`.
- **Frontend Screen Update**: The frontend **only** displays the "You Are Online" screen when the backend returns `allowed: true`.

---

## 🛡️ Anti-Hack Security Layers

| Layer | What It Does |
|---|---|
| **Backend is Mandatory** | Never trust client state. The server decides if the driver can go online. |
| **Auth** | Every request carries a valid driver JWT / session header. |
| **Rate Limit** | Enforces max 5 verification attempts per 10 minutes. |
| **Timestamp / Session Expiry** | Stores `last_verified_at`. Forces a new live check if older than session limit (e.g. 4 hours). |
| **Device Binding** | Logs device User-Agent / device fingerprint to detect session hijacking. |
| **Tamper Resistance** | DevTools tampering cannot make a driver receive rides because ride dispatching checks `is_online = true` and `last_verified_at > NOW() - INTERVAL 4 HOUR` in the database. |

---

## 📡 API Endpoints

- `GET  /api/driver/status` — Retrieves current driver status, profile, and active token.
- `POST /api/driver/verify-live` — Validates liveness result, updates DB, and puts driver online.
- `POST /api/driver/go-offline` — Sets driver status to offline in the database.

