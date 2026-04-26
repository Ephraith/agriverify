require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { init } = require('./src/models/database');
const telemetryRoutes = require('./src/routes/telemetry');
const mockRoutes = require('./src/routes/mock');
const alertRoutes = require('./src/routes/alerts');
const adminRoutes = require('./src/routes/admin');
const mpesaRoutes = require('./src/routes/mpesa');
const farmerRoutes = require('./src/routes/farmer');

init();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/public')));

app.use('/api/telemetry', telemetryRoutes(io));
app.use('/mock', mockRoutes(io));
app.use('/api/alerts', alertRoutes(io));
app.use('/admin', adminRoutes(io));
app.use('/mpesa', mpesaRoutes(io));
app.use('/farmer', farmerRoutes(io));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/public/index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../frontend/public/admin.html')));

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
