const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorize } = require('../middleware/auth');
const {
    getProperties,
    getPropertyById,
    createProperty,
    updateProperty,
    deleteProperty,
    getStats,
    getPropertyBookings
} = require('../controllers/propertyController');

// Configure multer for image upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    }
});

// Public routes
router.get('/', getProperties);
router.get('/featured', getProperties);
router.get('/:id/bookings', getPropertyBookings);
router.get('/:id', getPropertyById);

// Protected routes
router.use(protect);
router.post('/', upload.array('images', 5), createProperty);
router.put('/:id', upload.array('images', 5), updateProperty);
router.delete('/:id', authorize('admin'), deleteProperty);
router.get('/stats', getStats);

module.exports = router; 