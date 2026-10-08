'use strict';

const { z } = require('zod');
const { listQuery, text, optionalText, latitude, longitude, isoDateTime } = require('./common.schema');

const INCIDENT_KINDS = ['fire', 'flood', 'accident', 'collapse', 'medical', 'other'];
const SEVERITIES = ['p1', 'p2', 'p3'];
const INCIDENT_STATUSES = ['open', 'dispatched', 'resolved', 'cancelled'];
const SOURCES = ['manual', 'ml', 'sim'];

const createIncidentSchema = z.object({
  title: text(160, 'title is required'),
  kind: z.enum(INCIDENT_KINDS),
  severity: z.enum(SEVERITIES).default('p2'),
  status: z.enum(INCIDENT_STATUSES).default('open'),
  description: optionalText(2000),
  lat: latitude,
  lng: longitude,
  nodeId: optionalText(64),
  source: z.enum(SOURCES).default('manual'),
  confidence: z.number().min(0).max(1).nullable().optional(),
  occurredAt: isoDateTime.nullable().optional(),
});

const updateIncidentSchema = z
  .object({
    title: text(160).optional(),
    kind: z.enum(INCIDENT_KINDS).optional(),
    severity: z.enum(SEVERITIES).optional(),
    status: z.enum(INCIDENT_STATUSES).optional(),
    description: optionalText(2000),
    lat: latitude,
    lng: longitude,
    nodeId: optionalText(64),
    confidence: z.number().min(0).max(1).nullable().optional(),
    occurredAt: isoDateTime.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'no fields to update' });

const listIncidentsQuery = listQuery.extend({
  status: z.enum(INCIDENT_STATUSES).optional(),
  kind: z.enum(INCIDENT_KINDS).optional(),
  severity: z.enum(SEVERITIES).optional(),
  source: z.enum(SOURCES).optional(),
  search: z.string().trim().max(120).optional(),
});

module.exports = {
  INCIDENT_KINDS,
  SEVERITIES,
  INCIDENT_STATUSES,
  SOURCES,
  createIncidentSchema,
  updateIncidentSchema,
  listIncidentsQuery,
};
