'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Behind a reverse proxy this makes req.ip and the rate limiter see the real client.
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: false, limit: '15mb' }));

if (!config.isTest) {
  app.use(morgan(config.isProduction ? 'combined' : 'dev'));
}

/** Liveness probe - no authentication, safe to poll. */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'packmen-web-backend',
    environment: config.nodeEnv,
    time: new Date().toISOString(),
  });
});

app.use('/api', routes);

// Order matters: unmatched route first, then the single error handler.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
