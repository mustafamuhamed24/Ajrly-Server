const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    createBooking,
    getUserBookings,
    deleteBooking,
    getBookingById,
    cancelBooking,
    getOwnerBookings
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
router.get('/owner/list', getOwnerBookings);

module.exports = router; 