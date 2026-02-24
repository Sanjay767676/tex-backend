const express = require('express');
const cors = require('cors');
const connectionRoutes = require('./routes/connectionRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const scanRoutes = require('./routes/scanRoutes');

const app = express();

// Trust Azure proxy headers for correct client IPs
app.set('trust proxy', 1);

app.use(cors());

// Apply JSON body parser for all routes
app.use(express.json());

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// Mount routes
app.use('/', scanRoutes);
app.use('/', connectionRoutes);
app.use('/', paymentRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

module.exports = app;
