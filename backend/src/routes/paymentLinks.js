const router = require('express').Router({ mergeParams: true });
const { body, validationResult } = require('express-validator');
const { School, Student, AuditLog } = require('../models');
const squadService = require('../services/squadService');

// POST /api/v1/schools/:id/payment-links
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

// GET /api/v1/schools/:id/students — list students with payment status
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
