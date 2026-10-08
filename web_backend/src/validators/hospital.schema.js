'use strict';

const { z } = require('zod');
const { listQuery, text, optionalText, latitude, longitude } = require('./common.schema');

const baseHospital = {
  name: text(160, 'name is required'),
  code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/, 'letters, numbers, - and _ only'),
  nodeId: optionalText(64),
  lat: latitude,
  lng: longitude,
  phone: optionalText(40),
  totalBeds: z.number().int().min(0).default(0),
  availableBeds: z.number().int().min(0).default(0),
  hasTraumaUnit: z.boolean().default(false),
};

/** availableBeds can never exceed totalBeds - checked here and on update. */
const bedsAreConsistent = (data) =>
  data.totalBeds === undefined ||
  data.availableBeds === undefined ||
  data.availableBeds <= data.totalBeds;

const createHospitalSchema = z
  .object(baseHospital)
  .refine(bedsAreConsistent, { message: 'availableBeds cannot exceed totalBeds', path: ['availableBeds'] });

const updateHospitalSchema = z
  .object({
    name: baseHospital.name.optional(),
    code: baseHospital.code.optional(),
    nodeId: baseHospital.nodeId,
    lat: baseHospital.lat,
    lng: baseHospital.lng,
    phone: baseHospital.phone,
    totalBeds: z.number().int().min(0).optional(),
    availableBeds: z.number().int().min(0).optional(),
    hasTraumaUnit: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'no fields to update' })
  .refine(bedsAreConsistent, { message: 'availableBeds cannot exceed totalBeds', path: ['availableBeds'] });

const listHospitalsQuery = listQuery.extend({
  search: z.string().trim().max(120).optional(),
  hasTraumaUnit: z.enum(['true', 'false']).optional(),
});

module.exports = { createHospitalSchema, updateHospitalSchema, listHospitalsQuery };
