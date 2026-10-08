'use strict';

const { z } = require('zod');

/** `/:id` - every id in this system is a UUID. */
const idParam = z.object({
  id: z.string().uuid('must be a valid id'),
});

/** Shared list query: `?limit=50&offset=0&order=desc` */
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  order: z.enum(['asc', 'desc']).default('desc'),
});

/** Optional ISO date-time string, e.g. 2026-09-15T10:30:00.000Z */
const isoDateTime = z.string().datetime({ message: 'must be an ISO-8601 date-time' });

/** Trimmed, non-empty text with a maximum length. */
function text(max, message = 'is required') {
  return z.string().trim().min(1, message).max(max);
}

/** Optional text that turns an empty string into null (easier for form inputs). */
function optionalText(max) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
}

const optionalId = z.string().uuid('must be a valid id').nullable().optional();

const latitude = z.number().min(-90).max(90).nullable().optional();
const longitude = z.number().min(-180).max(180).nullable().optional();

module.exports = { idParam, listQuery, isoDateTime, text, optionalText, optionalId, latitude, longitude };
