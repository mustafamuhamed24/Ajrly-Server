const mongoose = require('mongoose');
const Property = require('../models/Property');
const User = require('../models/User');
require('dotenv').config();

async function createTestProperty() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find or create a test user
        let testUser = await User.findOne({ email: 'test@example.com' });
        if (!testUser) {
            testUser = await User.create({
                name: 'Test User',
                email: 'test@example.com',
                password: 'password123',
                role: 'user'
            });
            console.log('Created test user');
        }

        // Create a test property
        const testProperty = await Property.create({
            title: 'Test Property',
            description: 'This is a test property',
            type: 'apartment',
            price: 1000,
            bedrooms: 2,
            bathrooms: 1,
            area: 1000,
            status: 'active',
            location: {
                address: '123 Test St',
                city: 'Test City',
                state: 'Test State',
                country: 'Test Country'
            },
            images: [{
                url: 'https://via.placeholder.com/800x600',
                publicId: 'test-image'
            }],
            owner: testUser._id
        });

        console.log('Created test property:', testProperty);
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

createTestProperty(); 