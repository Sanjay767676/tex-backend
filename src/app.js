const express = require('express');
const cors = require('cors');
const path = require('path');
const connectionRoutes = require('./routes/connectionRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const scanRoutes = require('./routes/scanRoutes');
const previewRoutes = require('./routes/previewRoutes');

const app = express();

// Trust Azure proxy headers for correct client IPs
app.set('trust proxy', 1);

app.use(cors());

// Apply JSON body parser for all routes
app.use(express.json());

// Serve static assets for templates
app.use('/assets', express.static(path.join(__dirname, '../assets')));

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// Mount routes
app.use('/', scanRoutes);
app.use('/', connectionRoutes);
app.use('/', paymentRoutes);
app.use('/preview', previewRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

module.exports = app;
