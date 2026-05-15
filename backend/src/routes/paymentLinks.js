const router = require('express').Router({ mergeParams: true });
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { School, Student, AuditLog } = require('../models');
const squadService = require('../services/squadService');
const { sendText } = require('../services/whatsappService');
const logger = require('../config/logger');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

/**
 * @swagger
 * /api/v1/schools/{id}/payment-links:
 *   post:
 *     summary: Bulk-generate Squad payment links for students
 *     description: |
 *       Calls Squad Payment Links API for each student and stores the
 *       link-to-student mapping. Supports 150+ students via internal batching.
 *     tags: [Collections]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: School UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [students, term]
 *             properties:
 *               term:
 *                 type: string
 *                 example: "Term 1 2026"
 *               academic_year:
 *                 type: string
 *                 example: "2025/2026"
 *               notify_whatsapp:
 *                 type: boolean
 *                 default: false
 *                 description: Send payment link to parent via WhatsApp
 *               students:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [name, fee_amount]
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: Adaeze Obi
 *                     class:
 *                       type: string
 *                       example: JSS 3
 *                     fee_amount:
 *                       type: number
 *                       example: 65000
 *                     parent_phone:
 *                       type: string
 *                       example: "+2348098765432"
 *     responses:
 *       201:
 *         description: Links generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 generated:
 *                   type: integer
 *                   example: 150
 *                 links:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       student_id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       payment_url:
 *                         type: string
 *                         format: uri
 *                       amount:
 *                         type: number
 *                       status:
 *                         type: string
 *                         example: pending
 *       400:
 *         description: Validation error
 *       404:
 *         description: School not found
 */
router.post('/', [
  body('students').isArray({ min: 1 }).withMessage('Students array required'),
  body('students.*.name').notEmpty(),
  body('students.*.fee_amount').isFloat({ min: 1 }),
  body('term').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const school = await School.findByPk(req.params.id);
    if (!school) return res.status(404).json({ error: 'School not found' });

    const { students, term, academic_year, notify_whatsapp } = req.body;
    const results = [];
    const BATCH_SIZE = 10;
    let notified = 0;

    for (let i = 0; i < students.length; i += BATCH_SIZE) {
      const batch = students.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (s) => {
          const linkRes = await squadService.createPaymentLink({
            name: `${school.name} - ${s.name} - ${term}`,
            hash: `${school.id}-${s.name.replace(/\s/g, '')}-${Date.now()}`,
            link_status: 1,
            expire_by: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            amount: s.fee_amount * 100,
            currency_id: 'NGN',
            description: `School fee for ${s.name} - ${term}`,
          });

          const student = await Student.upsert({
            school_id: school.id,
            name: s.name,
            class: s.class,
            parent_phone: s.parent_phone,
            fee_amount: s.fee_amount,
            payment_link_id: linkRes?.data?.link_id,
            squad_link_url: linkRes?.data?.link,
            term: term || 'Term 1',
            academic_year: academic_year || new Date().getFullYear().toString(),
          });

          const paymentUrl = linkRes?.data?.link;

          // Optionally notify parent via WhatsApp
          if (notify_whatsapp && s.parent_phone && paymentUrl) {
            sendText(
              s.parent_phone,
              `Hello! ${school.name} has generated a school fee payment link for ${s.name} (${term}).\n\nAmount: ₦${Number(s.fee_amount).toLocaleString()}\nPay here: ${paymentUrl}\n\nPowered by SquadBridge`
            ).then(() => { notified++; }).catch((e) => logger.warn({ fn: 'paymentLinks.notify', error: e.message }));
          }

          return {
            student_id: student[0].id,
            name: s.name,
            payment_url: paymentUrl,
            payment_link_id: linkRes?.data?.link_id,
            amount: s.fee_amount,
            parent_notified: !!(notify_whatsapp && s.parent_phone && paymentUrl),
            status: 'pending',
          };
        })
      );
      results.push(...batchResults);
    }

    await AuditLog.create({
      school_id: school.id,
      event_type: 'LINK_GENERATED',
      description: `Generated ${results.length} payment links for ${term}`,
    });

    res.status(201).json({ generated: results.length, whatsapp_notified: notified, links: results });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/v1/schools/{id}/payment-links/students:
 *   get:
 *     summary: List students with payment status
 *     tags: [Collections]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [unpaid, partial, paid]
 *         description: Filter by payment status
 *       - in: query
 *         name: term
 *         schema:
 *           type: string
 *         example: "Term 1 2026"
 *     responses:
 *       200:
 *         description: List of students
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Student'
 */
router.get('/students', async (req, res, next) => {
  try {
    const { status, term } = req.query;
    const where = { school_id: req.params.id };
    if (status) where.fee_status = status;
    if (term) where.term = term;

    const students = await Student.findAll({ where, order: [['name', 'ASC']] });
    res.json(students);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/v1/schools/{id}/payment-links/import:
 *   post:
 *     summary: Bulk import students + generate payment links from CSV
 *     description: |
 *       Upload a CSV with columns: name, class, fee_amount, parent_phone (optional).
 *       Generates Squad payment links for each row and returns results.
 *       Set notify_whatsapp=true query param to send links to parent phones.
 *     tags: [Collections]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: term
 *         required: true
 *         schema:
 *           type: string
 *         example: "Term 1 2026"
 *       - in: query
 *         name: notify_whatsapp
 *         schema:
 *           type: boolean
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: CSV file (columns - name, class, fee_amount, parent_phone)
 *     responses:
 *       201:
 *         description: Import complete
 *       400:
 *         description: Invalid CSV
 *       404:
 *         description: School not found
 */
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'CSV file required (field name: file)' });

    const term = req.query.term;
    if (!term) return res.status(400).json({ error: 'term query param required' });

    const school = await School.findByPk(req.params.id);
    if (!school) return res.status(404).json({ error: 'School not found' });

    let rows;
    try {
      rows = parse(req.file.buffer.toString('utf8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (parseErr) {
      return res.status(400).json({ error: `CSV parse error: ${parseErr.message}` });
    }

    if (!rows.length) return res.status(400).json({ error: 'CSV has no data rows' });

    const notifyWhatsapp = req.query.notify_whatsapp === 'true';
    const results = [];
    const errors = [];
    const BATCH_SIZE = 10;
    let notified = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (row, idx) => {
          const name = row.name?.trim();
          const feeAmount = parseFloat(row.fee_amount);
          if (!name || isNaN(feeAmount) || feeAmount <= 0) {
            throw new Error(`Row ${i + idx + 2}: name and fee_amount are required`);
          }

          const linkRes = await squadService.createPaymentLink({
            name: `${school.name} - ${name} - ${term}`,
            hash: `${school.id}-${name.replace(/\s/g, '')}-${Date.now()}-${i + idx}`,
            link_status: 1,
            expire_by: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            amount: feeAmount * 100,
            currency_id: 'NGN',
            description: `School fee for ${name} - ${term}`,
          });

          const student = await Student.upsert({
            school_id: school.id,
            name,
            class: row.class?.trim() || null,
            parent_phone: row.parent_phone?.trim() || null,
            fee_amount: feeAmount,
            payment_link_id: linkRes?.data?.link_id,
            squad_link_url: linkRes?.data?.link,
            term,
            academic_year: new Date().getFullYear().toString(),
          });

          const paymentUrl = linkRes?.data?.link;
          const parentPhone = row.parent_phone?.trim();
          if (notifyWhatsapp && parentPhone && paymentUrl) {
            sendText(parentPhone, `Hello! ${school.name} has generated your child ${name}'s fee payment link for ${term}.\n\nAmount: ₦${feeAmount.toLocaleString()}\nPay here: ${paymentUrl}\n\nPowered by SquadBridge`)
              .then(() => { notified++; })
              .catch((e) => logger.warn({ fn: 'csv.notify', error: e.message }));
          }

          return {
            student_id: student[0].id,
            name,
            class: row.class?.trim() || null,
            payment_url: paymentUrl,
            amount: feeAmount,
            parent_notified: !!(notifyWhatsapp && parentPhone && paymentUrl),
            status: 'pending',
          };
        })
      );

      for (const r of batchResults) {
        if (r.status === 'fulfilled') results.push(r.value);
        else errors.push(r.reason?.message || 'Unknown error');
      }
    }

    await AuditLog.create({
      school_id: school.id,
      event_type: 'LINK_GENERATED',
      description: `CSV import: ${results.length} links generated for ${term} (${errors.length} errors)`,
    });

    res.status(201).json({
      generated: results.length,
      errors: errors.length,
      whatsapp_notified: notified,
      error_details: errors,
      links: results,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
