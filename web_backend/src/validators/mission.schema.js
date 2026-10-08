'use strict';

const { z } = require('zod');
const { listQuery, optionalText, optionalId, isoDateTime } = require('./common.schema');

const MISSION_STATUSES = [
  'pending',
  'assigned',
  'enroute',
  'onscene',
  'transporting',
  'completed',
  'cancelled',
];
const PRIORITIES = ['p1', 'p2', 'p3'];

/** Which statuses a mission is allowed to move to. Terminal states have none. */
const STATUS_TRANSITIONS = {
  pending: ['assigned', 'cancelled'],
  assigned: ['enroute', 'cancelled'],
  enroute: ['onscene', 'cancelled'],
  onscene: ['transporting', 'completed', 'cancelled'],
  transporting: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const createMissionSchema = z.object({
  incidentId: optionalId,
  vehicleId: optionalId,
  hospitalId: optionalId,
  simMissionId: optionalText(64),
  priority: z.enum(PRIORITIES).default('p2'),
  status: z.enum(MISSION_STATUSES).default('pending'),
  originNode: optionalText(64),
  destNode: optionalText(64),
  etaSeconds: z.number().min(0).nullable().optional(),
  distanceM: z.number().min(0).nullable().optional(),
  notes: optionalText(2000),
  dispatchedAt: isoDateTime.nullable().optional(),
});

const updateMissionSchema = z
  .object({
    incidentId: optionalId,
    vehicleId: optionalId,
    hospitalId: optionalId,
    priority: z.enum(PRIORITIES).optional(),
    originNode: optionalText(64),
    destNode: optionalText(64),
    etaSeconds: z.number().min(0).nullable().optional(),
    actualSeconds: z.number().min(0).nullable().optional(),
    distanceM: z.number().min(0).nullable().optional(),
    notes: optionalText(2000),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'no fields to update' });

const updateStatusSchema = z.object({
  status: z.enum(MISSION_STATUSES),
});

const listMissionsQuery = listQuery.extend({
  status: z.enum(MISSION_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  vehicleId: z.string().uuid().optional(),
  incidentId: z.string().uuid().optional(),
});

module.exports = {
  MISSION_STATUSES,
  PRIORITIES,
  STATUS_TRANSITIONS,
  createMissionSchema,
  updateMissionSchema,
  updateStatusSchema,
  listMissionsQuery,
};
