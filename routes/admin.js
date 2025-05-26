const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { upload, handleMulterError } = require('../middleware/upload');
const {
    getStatistics,
    listProperties,
    createProperty,
    updateProperty,
    deleteProperty,
    listBookings,
    updateBookingStatus,
    deleteBooking,
    listUsers,
    updateUserRole,
    deleteUser,
    getPropertyById
} = require('../controllers/admin');

// All routes are protected but don't require admin role
router.use(protect);

// Statistics - now returns user-specific stats
router.get('/stats', getStatistics);

// Properties - now includes user's own properties
router.get('/properties', listProperties);
router.post('/properties', upload.array('images', 5), handleMulterError, createProperty);
router.get('/properties/:id', getPropertyById);
router.put('/properties/:id', upload.array('images', 5), handleMulterError, updateProperty);
router.delete('/properties/:id', deleteProperty);

// Bookings - now includes user's own bookings
router.get('/bookings', listBookings);
router.put('/bookings/:id/status', updateBookingStatus);
router.delete('/bookings/:id', deleteBooking);

// Users - now includes user's own profile
router.get('/users', listUsers);
router.put('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUser);

const formatLocation = (location) => {
    if (!location) return '';
    const { address, city, state, country } = location;
    return `${address}, ${city}, ${state}, ${country}`;
};

module.exports = router; 