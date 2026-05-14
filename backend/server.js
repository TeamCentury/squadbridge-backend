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
  try {
    await sequelize.authenticate();
    logger.info('Database connection established');

    // Sync tables in development; use migrations in production
    if (process.env.NODE_ENV !== 'production') {
      await sequelize.sync({ alter: true });
      logger.info('Database synced');
    }

    server.listen(PORT, () => {
      logger.info(`SquadBridge API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
  } catch (err) {
    logger.error({ message: 'Failed to start server', error: err.message });
    process.exit(1);
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
