const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// --- In-Memory / File Database Initializer ---
/*
  PRODUCTION DATABASE SCHEMA (PostgreSQL / MySQL / SQLite):

  CREATE TABLE drivers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    vehicle VARCHAR(128),
    reference_photo LONGTEXT NULL,        -- Real registered reference photo (base64)
    reference_landmarks JSON NULL,        -- Stored facial landmark vector
    verification_status VARCHAR(32) DEFAULT 'pending',
    last_verified_at TIMESTAMP NULL,
    is_online BOOLEAN DEFAULT FALSE,
    device_info TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE verification_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    driver_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    match_score FLOAT,
    attempt_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    live_face_crop LONGTEXT,
    device_info TEXT,
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
  );
*/

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      drivers: {
        "DRV-1001": {
          id: "DRV-1001",
          name: "Driver (You)",
          vehicle: "DL-01-AB-1234",
          reference_photo: null,       // Real user reference image
          reference_landmarks: null,
          verification_status: "pending",
          last_verified_at: null,
          is_online: false,
          device_info: null
        }
      },
      verification_attempts: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { drivers: {}, verification_attempts: [] };
  }
}

function saveDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Rate Limiter: Max 5 attempts per 10 minutes per driver
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function checkRateLimit(driverId, db) {
  const now = Date.now();
  const recentAttempts = db.verification_attempts.filter(
    a => a.driverId === driverId && (now - new Date(a.timestamp).getTime()) < RATE_LIMIT_WINDOW_MS
  );
  return recentAttempts.length < MAX_ATTEMPTS;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API ROUTE: GET Driver Status ---
  if (req.method === 'GET' && pathname === '/api/driver/status') {
    const db = loadDb();
    const driver = db.drivers["DRV-1001"];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      driver,
      auth_token: "mock-jwt-driver-drv-1001-valid",
      server_time: new Date().toISOString()
    }));
    return;
  }

  // --- API ROUTE: POST Register Real User Reference Photo ---
  if (req.method === 'POST' && pathname === '/api/driver/register-reference') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (!payload.photo) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Reference photo is required' }));
          return;
        }

        const db = loadDb();
        const driver = db.drivers["DRV-1001"];

        // Security Check: Reference image cannot change frequently (Lockdown Policy)
        if (driver.reference_locked && !payload.adminReset) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Security Policy: Your reference photo is locked as an official KYC record. Reference photos cannot be changed frequently to prevent account sharing and identity fraud.'
          }));
          return;
        }

        // Validate that first-time enrollment passed pose & liveness
        if (!payload.poseApproved) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Reference photo rejected: Must be a clear, high-quality frontal portrait pose.'
          }));
          return;
        }

        const nowIso = new Date().toISOString();
        driver.reference_photo = payload.photo;
        driver.reference_landmarks = payload.landmarks || null;
        driver.reference_locked = true; // Lock immediately upon registration
        driver.reference_registered_at = nowIso;
        driver.reference_change_count = (driver.reference_change_count || 0) + 1;
        driver.verification_status = 'reference_registered';
        saveDb(db);

        console.log(`[KYC-LOCKED] Driver ${driver.id} registered locked reference photo at ${nowIso}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: "Real reference photo registered & securely locked as official KYC record.",
          reference_photo: driver.reference_photo,
          reference_locked: true,
          reference_registered_at: driver.reference_registered_at
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // --- API ROUTE: POST Register Government ID Card ---
  if (req.method === 'POST' && pathname === '/api/driver/register-id-card') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (!payload.idCardPhoto || !payload.extractedFacePhoto) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Both Government ID photo and extracted face photo are required.' }));
          return;
        }

        const db = loadDb();
        const driver = db.drivers["DRV-1001"];

        if (driver.reference_locked && !payload.adminReset) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Security Policy: Your KYC record is locked. To change official documents, contact verification support.'
          }));
          return;
        }

        const nowIso = new Date().toISOString();
        driver.id_card_photo = payload.idCardPhoto;
        driver.id_type = payload.idType || "Driver's License";
        driver.reference_photo = payload.extractedFacePhoto;
        driver.reference_landmarks = payload.landmarks || null;
        driver.reference_source = "government_id";
        driver.reference_locked = true;
        driver.reference_registered_at = nowIso;
        driver.verification_status = 'id_verified';
        saveDb(db);

        console.log(`[GOV-ID-REGISTERED] Driver ${driver.id} registered Government ID (${driver.id_type}) at ${nowIso}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Government ID (${driver.id_type}) registered and reference face extracted successfully.`,
          reference_photo: driver.reference_photo,
          reference_locked: true,
          reference_registered_at: driver.reference_registered_at,
          id_card_photo: driver.id_card_photo,
          id_type: driver.id_type
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // --- API ROUTE: POST Admin Reset Reference (For developer testing only) ---
  if (req.method === 'POST' && pathname === '/api/driver/admin-reset-reference') {
    const db = loadDb();
    const driver = db.drivers["DRV-1001"];
    driver.reference_photo = null;
    driver.reference_landmarks = null;
    driver.id_card_photo = null;
    driver.id_type = null;
    driver.reference_source = null;
    driver.reference_locked = false;
    driver.reference_registered_at = null;
    driver.is_online = false;
    driver.verification_status = 'pending';
    saveDb(db);

    console.log(`[ADMIN-RESET] Reference photo & ID card unlocked and reset for testing.`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: "Reference photo and ID records unlocked and cleared." }));
    return;
  }

  // --- API ROUTE: POST Live Verification & Face Matching (/api/driver/verify-live) ---
  if (req.method === 'POST' && pathname === '/api/driver/verify-live') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const authHeader = req.headers['authorization'] || '';

        // Security Check 1: Authentication
        if (!authHeader.startsWith('Bearer mock-jwt-driver-drv-1001')) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ allowed: false, error: 'Unauthorized: Invalid driver session' }));
          return;
        }

        const driverId = "DRV-1001";
        const db = loadDb();
        const driver = db.drivers[driverId];

        // Security Check 2: Require real reference image
        if (!driver || !driver.reference_photo) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            allowed: false,
            error: 'No reference photo registered! Please capture or upload your real reference photo first.'
          }));
          return;
        }

        // Security Check 3: Rate Limiting
        if (!checkRateLimit(driverId, db)) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            allowed: false,
            error: 'Too many verification attempts (max 5 per 10 mins). Please wait.'
          }));
          return;
        }

        // Security Check 4: Liveness Challenge Passed
        if (!payload.challengePassed) {
          db.verification_attempts.push({
            driverId,
            timestamp: new Date().toISOString(),
            status: 'failed_liveness',
            reason: 'Liveness challenge not completed'
          });
          saveDb(db);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ allowed: false, error: 'Active liveness challenge failed' }));
          return;
        }

        // Security Check 5: Real 1:1 Face Match Score
        const matchScore = typeof payload.matchScore === 'number' ? payload.matchScore : 0;
        if (matchScore < 70) {
          db.verification_attempts.push({
            driverId,
            timestamp: new Date().toISOString(),
            status: 'face_mismatch',
            matchScore,
            reason: `Face similarity too low (${matchScore}% < 70% threshold)`
          });
          saveDb(db);
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            allowed: false,
            error: `Face mismatch! Live selfie similarity (${matchScore}%) does not match your registered reference photo.`
          }));
          return;
        }

        // --- All checks passed -> Update Database ---
        const nowIso = new Date().toISOString();
        driver.last_verified_at = nowIso;
        driver.verification_status = 'passed';
        driver.is_online = true;
        driver.device_info = req.headers['user-agent'] || 'Unknown Device';

        db.verification_attempts.push({
          driverId,
          timestamp: nowIso,
          status: 'success',
          matchScore,
          device_info: driver.device_info,
          hasFaceCrop: Boolean(payload.liveFaceCrop)
        });

        saveDb(db);

        console.log(`[VERIFIED-OK] Driver ${driverId} verified with ${matchScore}% face match at ${nowIso}. Status -> ONLINE`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          allowed: true,
          message: "Real face matched and liveness verified. Driver is now ONLINE.",
          matchScore,
          driver: {
            id: driver.id,
            name: driver.name,
            reference_photo: driver.reference_photo,
            last_verified_at: driver.last_verified_at,
            is_online: driver.is_online,
            session_valid_hours: 4
          }
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ allowed: false, error: 'Internal server error: ' + err.message }));
      }
    });
    return;
  }

  // --- API ROUTE: POST Go Offline ---
  if (req.method === 'POST' && pathname === '/api/driver/go-offline') {
    const db = loadDb();
    const driverId = "DRV-1001";
    if (db.drivers[driverId]) {
      db.drivers[driverId].is_online = false;
      saveDb(db);
      console.log(`[OFFLINE] Driver ${driverId} set to OFFLINE.`);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, is_online: false }));
    return;
  }

  // --- Static File Serving ---
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';
  if (safePath === '/enterprise-kyc' || safePath === '/enterprise-kyc/' || safePath === '\\enterprise-kyc' || safePath === '\\enterprise-kyc\\') {
    safePath = '/enterprise-kyc/index.html';
  }
  const filePath = path.join(__dirname, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Driver Face KYC Server running at http://localhost:${PORT}`);
  console.log(`📡 Endpoints:`);
  console.log(`   - POST /api/driver/register-reference (save real user photo)`);
  console.log(`   - POST /api/driver/verify-live (face match & liveness DB check)`);
  console.log(`   - POST /api/driver/go-offline`);
  console.log(`   - GET  /api/driver/status`);
});

