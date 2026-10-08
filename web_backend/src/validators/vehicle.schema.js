'use strict';

const { z } = require('zod');
const { listQuery, optionalText, optionalId } = require('./common.schema');

const VEHICLE_TYPES = ['ambulance', 'firetruck', 'police'];
const VEHICLE_STATUSES = ['idle', 'enroute', 'onscene', 'returning', 'offline'];

const callsign = z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/, 'letters, numbers, - and _ only');

const createVehicleSchema = z.object({
  callsign,
  type: z.enum(VEHICLE_TYPES),
  status: z.enum(VEHICLE_STATUSES).default('idle'),
  registration: optionalText(40),
  capacity: z.number().int().min(0).max(100).default(1),
  homeHospitalId: optionalId,
  simUnitId: optionalText(64),
});

const updateVehicleSchema = z
  .object({
    callsign: callsign.optional(),
    type: z.enum(VEHICLE_TYPES).optional(),
    status: z.enum(VEHICLE_STATUSES).optional(),
    registration: optionalText(40),
    capacity: z.number().int().min(0).max(100).optional(),
    homeHospitalId: optionalId,
    simUnitId: optionalText(64),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'no fields to update' });

const updateStatusSchema = z.object({
  status: z.enum(VEHICLE_STATUSES),
});

const listVehiclesQuery = listQuery.extend({
  type: z.enum(VEHICLE_TYPES).optional(),
  status: z.enum(VEHICLE_STATUSES).optional(),
  search: z.string().trim().max(120).optional(),
});

module.exports = {
  VEHICLE_TYPES,
  VEHICLE_STATUSES,
  createVehicleSchema,
  updateVehicleSchema,
  updateStatusSchema,
  listVehiclesQuery,
};
