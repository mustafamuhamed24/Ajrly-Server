const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const propertyRoutes = require('./routes/properties');
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');
const notificationRoutes = require('./routes/notifications');
const chatRoutes = require('./routes/chatRoutes');

// Import error handling middleware
const errorHandler = require('./middleware/error');

const app = express();

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "blob:", "http://localhost:5000", "http://localhost:3000", "https://mustafamuhamed24.github.io"],
            connectSrc: ["'self'", "http://localhost:5000", "http://localhost:3000", "https://mustafamuhamed24.github.io", "wss://ajrly-backend.onrender.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
        }
    }
}));
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// Enable CORS
app.use(cors({
    origin: [
        process.env.CLIENT_URL || 'http://localhost:3000',
        'https://mustafamuhamed24.github.io',
        'https://mustafamuhamed24.github.io/Ajrly-Client'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Static files - serve before other routes
const uploadsPath = path.join(__dirname, 'uploads');
const profileImagesPath = path.join(uploadsPath, 'profile-images');

// Ensure directories exist with proper permissions
try {
    if (!fs.existsSync(uploadsPath)) {
        fs.mkdirSync(uploadsPath, { recursive: true, mode: 0o755 });
        console.log('Created uploads directory:', uploadsPath);
    }

    if (!fs.existsSync(profileImagesPath)) {
        fs.mkdirSync(profileImagesPath, { recursive: true, mode: 0o755 });
        console.log('Created profile-images directory:', profileImagesPath);
    }
} catch (error) {
    console.error('Error creating directories:', error);
}

// Serve static files from uploads directory with enhanced error handling
app.use('/uploads', express.static(uploadsPath, {
    setHeaders: (res, filePath) => {
        try {
            // Set CORS headers
            res.set('Cross-Origin-Resource-Policy', 'cross-origin');
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Access-Control-Allow-Methods', 'GET');
            res.set('Access-Control-Allow-Credentials', 'true');
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.set('Pragma', 'no-cache');
            res.set('Expires', '0');

            // Set content type based on file extension
            const ext = path.extname(filePath).toLowerCase();
            switch (ext) {
                case '.png':
                    res.set('Content-Type', 'image/png');
                    break;
                case '.jpg':
                case '.jpeg':
                    res.set('Content-Type', 'image/jpeg');
                    break;
                case '.gif':
                    res.set('Content-Type', 'image/gif');
                    break;
                default:
                    res.set('Content-Type', 'application/octet-stream');
            }
        } catch (error) {
            console.error('Error setting headers:', error);
        }
    }
}));

// Add a specific route for profile images with better error handling
app.get('/uploads/profile-images/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(profileImagesPath, filename);
        const defaultImagePath = path.join(__dirname, 'public', 'default-profile.png');

        console.log('Attempting to serve file:', filePath);

        // Check if file exists
        if (!fs.existsSync(filePath)) {
            console.log('Profile image not found, serving default image');

            // Check if default image exists
            if (!fs.existsSync(defaultImagePath)) {
                console.error('Default profile image not found:', defaultImagePath);
                return res.status(404).json({
                    message: 'Profile image not found and default image unavailable'
                });
            }

            // Serve default image instead
            res.set('Content-Type', 'image/png');
            res.set('Cross-Origin-Resource-Policy', 'cross-origin');
            res.set('Access-Control-Allow-Origin', 'http://localhost:3000');
            res.set('Access-Control-Allow-Methods', 'GET');
            res.set('Access-Control-Allow-Credentials', 'true');
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.set('Pragma', 'no-cache');
            res.set('Expires', '0');

            const stream = fs.createReadStream(defaultImagePath);
            stream.on('error', (error) => {
                console.error('Error streaming default image:', error);
                if (!res.headersSent) {
                    res.status(500).json({
                        message: 'Error streaming default profile image',
                        error: error.message
                    });
                }
            });

            return stream.pipe(res);
        }

        // Check file permissions
        try {
            await fs.promises.access(filePath, fs.constants.R_OK);
        } catch (error) {
            console.error('File permission error:', error);
            return res.status(403).json({
                message: 'Permission denied accessing profile image'
            });
        }

        // Set content type based on file extension
        const ext = path.extname(filename).toLowerCase();
        switch (ext) {
            case '.png':
                res.set('Content-Type', 'image/png');
                break;
            case '.jpg':
            case '.jpeg':
                res.set('Content-Type', 'image/jpeg');
                break;
            case '.gif':
                res.set('Content-Type', 'image/gif');
                break;
            default:
                res.set('Content-Type', 'application/octet-stream');
        }

        // Set CORS headers
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        res.set('Access-Control-Allow-Origin', 'http://localhost:3000');
        res.set('Access-Control-Allow-Methods', 'GET');
        res.set('Access-Control-Allow-Credentials', 'true');
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        // Stream the file with error handling
        const stream = fs.createReadStream(filePath);
        stream.on('error', (error) => {
            console.error('Error streaming file:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    message: 'Error streaming profile image',
                    error: error.message
                });
            }
        });

        stream.pipe(res);
    } catch (error) {
        console.error('Unexpected error serving profile image:', error);
        if (!res.headersSent) {
            res.status(500).json({
                message: 'Internal server error serving profile image',
                error: error.message
            });
        }
    }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chats', chatRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        message: err.message || 'Internal Server Error',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

module.exports = app; 