const mongoose = require('mongoose');
const Property = require('./models/Property');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/property-booking';

async function run() {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

    const properties = await Property.find({});
    let updated = 0;
    let usedIds = new Set(properties.map(p => p.uniqueId).filter(Boolean));
    let nextNum = 1;

    for (let i = 0; i < properties.length; i++) {
        const prop = properties[i];
        if (!prop.uniqueId) {
            // Find the next available uniqueId
            let newId;
            do {
                newId = `PROP${(nextNum).toString().padStart(6, '0')}`;
                nextNum++;
            } while (usedIds.has(newId));
            prop.uniqueId = newId;
            usedIds.add(newId);
            await prop.save();
            updated++;
            console.log(`Updated property ${prop._id} with uniqueId ${prop.uniqueId}`);
        }
    }

    console.log(`Done! Updated ${updated} properties.`);
    mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    mongoose.disconnect();
}); 