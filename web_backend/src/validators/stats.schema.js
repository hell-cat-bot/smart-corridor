'use strict';

const { z } = require('zod');
const { listQuery } = require('./common.schema');

const dailyQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(14),
});

const auditQuery = listQuery.extend({
  entity: z.enum(['user', 'hospital', 'vehicle', 'incident', 'mission']).optional(),
  entityId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});

module.exports = { dailyQuery, auditQuery };
