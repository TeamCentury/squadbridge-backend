const router = require('express').Router({ mergeParams: true });
const { body, validationResult } = require('express-validator');
const { School, Student, AuditLog } = require('../models');
const squadService = require('../services/squadService');

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

    const { students, term, academic_year } = req.body;
    const results = [];
    const BATCH_SIZE = 10;

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

          return {
            student_id: student[0].id,
            name: s.name,
            payment_url: linkRes?.data?.link,
            payment_link_id: linkRes?.data?.link_id,
            amount: s.fee_amount,
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

    res.status(201).json({ generated: results.length, links: results });
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

module.exports = router;
