require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');
const { sequelize } = require('./src/models');
const logger = require('./src/config/logger');

const PORT = process.env.PORT || 3001;

const server = http.createServer(app);

// Socket.io — real-time dashboard updates
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || '*', methods: ['GET', 'POST'] },
});

app.set('io', io);

io.on('connection', (socket) => {
  const schoolId = socket.handshake.query.school_id;
  if (schoolId) {
    socket.join(`school:${schoolId}`);
    logger.info({ event: 'socket_connected', school_id: schoolId, socket_id: socket.id });
  }

  socket.on('disconnect', () => {
    logger.info({ event: 'socket_disconnected', socket_id: socket.id });
  });
});

async function start() {
  // Always start the HTTP server so /health and /api/docs are reachable
  server.listen(PORT, () => {
    logger.info(`SquadBridge API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    logger.info(`Swagger UI: http://localhost:${PORT}/api/docs`);
  });

  // Connect to DB — warn but don't crash if credentials are placeholder
  try {
    await sequelize.authenticate();
    logger.info('Database connection established');

    // sync({ force: false }) is safe in production — creates missing tables, never drops or alters existing ones
    await sequelize.sync({ force: false });
    logger.info('Database synced');
  } catch (err) {
    logger.warn(`Database unavailable: ${err.message} — API routes requiring DB will return 500 until connected`);
  }
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down gracefully');
  server.close(async () => {
    await sequelize.close();
    process.exit(0);
  });
});

start();
