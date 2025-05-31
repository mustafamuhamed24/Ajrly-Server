const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    createBooking,
    getUserBookings,
    deleteBooking,
    getBookingById,
    cancelBooking,
    getOwnerBookings,
    updateBookingStatus
} = require('../controllers/bookingController');

// Protected routes
router.use(protect);

// User routes
router.post('/', createBooking);
router.get('/list', getUserBookings);
router.delete('/:id', deleteBooking);
router.get('/:id', getBookingById);
router.put('/:id/cancel', cancelBooking);

// Owner routes
router.get('/owner', getOwnerBookings);
router.put('/:id/status', updateBookingStatus);

module.exports = router; 