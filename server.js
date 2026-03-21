const express = require("express");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Simple in-memory user store (replace with a database in production)
const users = [
    { id: 1, username: "admin", password: "admin123", role: "admin" },
    { id: 2, username: "user", password: "user123", role: "user" }
];

// Simple in-memory request log
const requestLog = [];

// Rate limiter: max 100 requests per 15 minutes per IP
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        error: "Too many requests from this IP. Please try again after 15 minutes."
    },
    standardHeaders: true,
    legacyHeaders: false
});

app.use(limiter);

// Logging middleware
function logRequest(req, res, next) {
    const entry = {
        method: req.method,
        path: req.path,
        ip: req.ip,
        timestamp: new Date().toISOString(),
        userAgent: req.get("User-Agent") || "unknown"
    };
    requestLog.push(entry);

    // Keep only last 200 logs
    if (requestLog.length > 200) {
        requestLog.splice(0, requestLog.length - 200);
    }

    console.log(`[${entry.timestamp}] ${entry.method} ${entry.path} from ${entry.ip}`);
    next();
}

app.use(logRequest);

// Auth middleware
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }

    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}

// Role check middleware
function requireRole(role) {
    return (req, res, next) => {
        if (req.user.role !== role) {
            return res.status(403).json({ error: "Forbidden. You do not have permission to access this resource." });
        }
        next();
    };
}

// Public Routes

app.get("/", (req, res) => {
    res.json({
        name: "API Gateway Lite",
        version: "1.0.0",
        status: "running",
        endpoints: {
            login: "POST /auth/login",
            profile: "GET /api/profile (requires token)",
            data: "GET /api/data (requires token)",
            admin: "GET /admin/logs (requires admin token)",
            health: "GET /health"
        }
    });
});

app.get("/health", (req, res) => {
    res.json({
        status: "healthy",
        uptime: process.uptime().toFixed(0) + " seconds",
        timestamp: new Date().toISOString()
    });
});

// Login endpoint
app.post("/auth/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }

    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
    }

    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: "1h" }
    );

    res.json({
        message: "Login successful",
        token: token,
        expiresIn: "1 hour"
    });
});

// Protected Routes

app.get("/api/profile", authenticate, (req, res) => {
    res.json({
        message: "Your profile data",
        user: {
            id: req.user.id,
            username: req.user.username,
            role: req.user.role
        }
    });
});

app.get("/api/data", authenticate, (req, res) => {
    const sampleData = [
        { id: 1, title: "Project Alpha", status: "active", progress: 75 },
        { id: 2, title: "Project Beta", status: "completed", progress: 100 },
        { id: 3, title: "Project Gamma", status: "pending", progress: 20 },
        { id: 4, title: "Project Delta", status: "active", progress: 50 }
    ];

    res.json({
        message: "Protected data retrieved successfully",
        requestedBy: req.user.username,
        data: sampleData
    });
});

// Admin Only Routes

app.get("/admin/logs", authenticate, requireRole("admin"), (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const recentLogs = requestLog.slice(-limit).reverse();

    res.json({
        message: "Request logs (admin only)",
        totalLogs: requestLog.length,
        showing: recentLogs.length,
        logs: recentLogs
    });
});

app.get("/admin/stats", authenticate, requireRole("admin"), (req, res) => {
    const methods = {};
    const paths = {};

    requestLog.forEach(entry => {
        methods[entry.method] = (methods[entry.method] || 0) + 1;
        paths[entry.path] = (paths[entry.path] || 0) + 1;
    });

    res.json({
        totalRequests: requestLog.length,
        methodBreakdown: methods,
        topPaths: Object.entries(paths)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([path, count]) => ({ path, count }))
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        error: "Endpoint not found",
        suggestion: "Visit GET / to see all available endpoints"
    });
});

// Error Handler
app.use((err, req, res, next) => {
    console.error("Server Error:", err.message);
    res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
    console.log(`API Gateway Lite running on http://localhost:${PORT}`);
});
