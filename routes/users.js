const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
    getUsers,
    deleteUser,
    updateUserRole
} = require('../controllers/users');
const { protect, authorize } = require('../middleware/auth');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { getUserStatus } = require('../socket');

// Ensure upload directory exists with proper permissions
const uploadDir = path.join(__dirname, '..', 'uploads', 'profile-images');
console.log('Upload directory path:', uploadDir);

try {
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
        console.log('Created upload directory:', uploadDir);
    }
} catch (error) {
    console.error('Error creating upload directory:', error);
}

// Multer setup for profile image upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        try {
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
                console.log('Created upload directory:', uploadDir);
            }
            cb(null, uploadDir);
        } catch (error) {
            console.error('Error in multer destination:', error);
            cb(error);
        }
    },
    filename: function (req, file, cb) {
        try {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname).toLowerCase();
            const filename = req.user._id + '-' + uniqueSuffix + ext;
            console.log('Generated filename:', filename);
            cb(null, filename);
        } catch (error) {
            console.error('Error generating filename:', error);
            cb(error);
        }
    }
});

const fileFilter = (req, file, cb) => {
    console.log('File received:', file.originalname, file.mimetype);
    // Check file type
    if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Not an image! Please upload only images.'), false);
    }

    // Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
        return cb(new Error('Invalid file type. Only JPG, PNG and GIF are allowed.'), false);
    }

    cb(null, true);
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File size too large. Maximum size is 5MB.' });
        }
        return res.status(400).json({ message: err.message });
    } else if (err) {
        return res.status(400).json({ message: err.message });
    }
    next();
};

// All routes are protected but don't require admin role
router.use(protect);

// User management routes - now accessible to all authenticated users
router.get('/admin', getUsers);
router.delete('/admin/:id', deleteUser);
router.put('/admin/:id/role', updateUserRole);

// Get current user profile
router.get('/me', async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user.name && user.email) {
            user.name = user.email.split('@')[0];
            await user.save();
        }

        // Check if profile image exists
        if (user.profileImage) {
            const imagePath = path.join(__dirname, '..', user.profileImage);
            console.log('Checking profile image path:', imagePath);
            if (!fs.existsSync(imagePath)) {
                console.log('Profile image not found, clearing reference');
                user.profileImage = '';
                await user.save();
            }
        }

        res.json(user);
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ message: 'Error fetching profile', error: error.message });
    }
});

// Update current user profile
router.put('/me', protect, async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const user = await User.findById(req.user._id);

        if (email) {
            user.email = email;
            if (!name) {
                user.name = email.split('@')[0];
            }
        }
        if (name) user.name = name;
        if (password) user.password = password;

        await user.save();

        // Create notification
        await Notification.create({
            user: user._id,
            message: 'Your profile was updated successfully.'
        });

        res.json({
            message: 'Profile updated',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                isAdmin: user.isAdmin,
                profileImage: user.profileImage
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error updating profile', error: error.message });
    }
});

// Upload profile image
router.post('/me/profile-image', protect, upload.single('profileImage'), handleMulterError, async (req, res) => {
    try {
        console.log('Upload request received:', {
            file: req.file,
            user: req.user._id,
            headers: req.headers
        });

        if (!req.file) {
            console.error('No file in request');
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            console.error('User not found:', req.user._id);
            // Clean up uploaded file if user not found
            const fullPath = path.join(uploadDir, req.file.filename);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
            return res.status(404).json({ message: 'User not found' });
        }

        // Delete old profile image if it exists
        if (user.profileImage) {
            const oldImagePath = path.join(__dirname, '..', user.profileImage);
            console.log('Checking old image path:', oldImagePath);
            if (fs.existsSync(oldImagePath)) {
                try {
                    fs.unlinkSync(oldImagePath);
                    console.log('Deleted old profile image');
                } catch (error) {
                    console.error('Error deleting old profile image:', error);
                }
            }
        }

        // Update user's profile image path
        const imagePath = `/uploads/profile-images/${req.file.filename}`;
        console.log('New image path:', imagePath);

        // Verify the file exists and is readable
        const fullPath = path.join(uploadDir, req.file.filename);
        console.log('Full file path:', fullPath);

        if (!fs.existsSync(fullPath)) {
            console.error('File not found at path:', fullPath);
            throw new Error('File was not saved properly');
        }

        try {
            fs.accessSync(fullPath, fs.constants.R_OK);
            console.log('File is readable');
        } catch (err) {
            console.error('File access error:', err);
            throw new Error('File is not readable');
        }

        // Update user profile
        try {
            user.profileImage = imagePath;
            await user.save();
            console.log('User profile updated successfully');
        } catch (saveError) {
            console.error('Error saving user profile:', saveError);
            throw new Error('Failed to update user profile');
        }

        // Create notification
        try {
            await Notification.create({
                user: user._id,
                message: 'Your profile image was updated successfully.'
            });
            console.log('Notification created');
        } catch (notificationError) {
            console.error('Error creating notification:', notificationError);
            // Don't throw error for notification failure
        }

        res.json({
            message: 'Profile image updated successfully',
            profileImage: user.profileImage
        });
    } catch (error) {
        console.error('Error uploading profile image:', {
            error: error.message,
            stack: error.stack,
            file: req.file,
            user: req.user?._id
        });

        // If there was an error, try to clean up the uploaded file
        if (req.file) {
            const fullPath = path.join(uploadDir, req.file.filename);
            if (fs.existsSync(fullPath)) {
                try {
                    fs.unlinkSync(fullPath);
                    console.log('Cleaned up uploaded file after error');
                } catch (cleanupError) {
                    console.error('Error cleaning up file:', cleanupError);
                }
            }
        }

        res.status(500).json({
            message: 'Error uploading profile image',
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Add after other routes
router.post('/status', async (req, res) => {
    const { userIds } = req.body;
    const statusList = getUserStatus(userIds);
    res.json(statusList);
});

module.exports = router; 