/**
 * SquadBridge Seed Script
 * Run: node src/seeds/seed.js
 *
 * Idempotent — checks for existing records before inserting.
 * Seeds: Employers, GigPosts, Traders, Graduates, OpportunityPool
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { v4: uuidv4 } = require('uuid');
const { sequelize, Employer, GigPost, Trader, Graduate, OpportunityPool } = require('../models');

// ─── Fixed UUIDs so re-runs stay idempotent ─────────────────────────────────

const EMPLOYERS = [
  {
    id: 'e1000000-0000-0000-0000-000000000001',
    name: 'Adewale Okonkwo',
    company: 'BuildRight Nigeria Ltd',
    phone: '08031000001',
    email: 'adewale@buildright.ng',
    state: 'Lagos',
    lga: 'Ikeja',
    industry: 'Construction',
    company_size: '11-50',
    bvn_verified: true,
  },
  {
    id: 'e1000000-0000-0000-0000-000000000002',
    name: 'Ngozi Eze',
    company: 'TechForward Solutions',
    phone: '08031000002',
    email: 'ngozi@techforward.ng',
    state: 'Abuja',
    lga: 'Wuse',
    industry: 'Technology',
    company_size: '1-10',
    bvn_verified: true,
  },
  {
    id: 'e1000000-0000-0000-0000-000000000003',
    name: 'Emeka Chukwu',
    company: 'Harvest Foods Nig',
    phone: '08031000003',
    email: 'emeka@harvestfoods.ng',
    state: 'Enugu',
    lga: 'Enugu North',
    industry: 'Food & Agriculture',
    company_size: '51-200',
    bvn_verified: false,
  },
];

const expires90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
const expires30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const expires60 = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

const GIG_POSTS = [
  // Construction / trades
  {
    id: 'g1000000-0000-0000-0000-000000000001',
    poster_id: 'e1000000-0000-0000-0000-000000000001',
    poster_type: 'employer',
    title: 'Experienced Electrician — 3-Month Site Contract',
    description: 'We need a certified electrician for full electrical installation on a new residential estate in Lekki Phase 2. Work includes wiring, fixtures, and final testing. Must have at least 3 years experience on construction sites.',
    category: 'Electrical',
    skills_required: JSON.stringify(['electrician', 'wiring', 'electrical installation']),
    budget_fixed: 180000,
    rate_type: 'fixed',
    duration_days: 90,
    location_type: 'onsite',
    state: 'Lagos',
    target_user_type: 'trader',
    status: 'open',
    expires_at: expires90,
  },
  {
    id: 'g1000000-0000-0000-0000-000000000002',
    poster_id: 'e1000000-0000-0000-0000-000000000001',
    poster_type: 'employer',
    title: 'Plumber — Residential Estate (5 Blocks)',
    description: 'Skilled plumber needed for plumbing installation across 5 residential blocks in Surulere. Job covers pipe laying, bathroom fixtures, and pressure testing. Housing provided during project.',
    category: 'Plumbing',
    skills_required: JSON.stringify(['plumber', 'plumbing', 'pipe fitting']),
    budget_fixed: 120000,
    rate_type: 'fixed',
    duration_days: 45,
    location_type: 'onsite',
    state: 'Lagos',
    target_user_type: 'trader',
    status: 'open',
    expires_at: expires60,
  },
  {
    id: 'g1000000-0000-0000-0000-000000000003',
    poster_id: 'e1000000-0000-0000-0000-000000000001',
    poster_type: 'employer',
    title: 'Tiler & Mason — Finishing Works',
    description: 'We need 2 experienced tilers for floor and wall tiling on a commercial building finishing project in Victoria Island. Materials supplied. Flexible start date.',
    category: 'Masonry',
    skills_required: JSON.stringify(['tiling', 'masonry', 'plastering']),
    budget_fixed: 85000,
    rate_type: 'fixed',
    duration_days: 30,
    location_type: 'onsite',
    state: 'Lagos',
    target_user_type: 'trader',
    status: 'open',
    expires_at: expires30,
  },
  // Technology / graduates
  {
    id: 'g1000000-0000-0000-0000-000000000004',
    poster_id: 'e1000000-0000-0000-0000-000000000002',
    poster_type: 'employer',
    title: 'Junior Frontend Developer — React.js (Remote)',
    description: 'TechForward is building a fintech dashboard and needs a junior frontend developer. You will work on React components, integrate REST APIs, and write clean accessible UI. Portfolio or GitHub required.',
    category: 'Software Development',
    skills_required: JSON.stringify(['react', 'javascript', 'html', 'css', 'frontend']),
    budget_fixed: 150000,
    rate_type: 'fixed',
    duration_days: 60,
    location_type: 'remote',
    state: 'Abuja',
    target_user_type: 'graduate',
    status: 'open',
    expires_at: expires60,
  },
  {
    id: 'g1000000-0000-0000-0000-000000000005',
    poster_id: 'e1000000-0000-0000-0000-000000000002',
    poster_type: 'employer',
    title: 'Data Entry & Admin Assistant (Remote)',
    description: 'Part-time data entry and administrative support for a growing tech company. Must be proficient with spreadsheets, able to manage emails and schedules. Minimum OND qualification.',
    category: 'Administration',
    skills_required: JSON.stringify(['data entry', 'microsoft excel', 'administration', 'spreadsheet']),
    budget_fixed: 50000,
    rate_type: 'per_day',
    duration_days: 30,
    location_type: 'remote',
    state: 'Abuja',
    target_user_type: 'all',
    status: 'open',
    expires_at: expires30,
  },
  {
    id: 'g1000000-0000-0000-0000-000000000006',
    poster_id: 'e1000000-0000-0000-0000-000000000002',
    poster_type: 'employer',
    title: 'Social Media Manager — 2-Month Contract',
    description: 'Manage our social media presence across Twitter, Instagram, and LinkedIn. Create content, grow engagement, and produce monthly reports. Must show previous work examples.',
    category: 'Marketing',
    skills_required: JSON.stringify(['social media', 'content creation', 'marketing', 'copywriting']),
    budget_fixed: 70000,
    rate_type: 'fixed',
    duration_days: 60,
    location_type: 'remote',
    state: 'Abuja',
    target_user_type: 'graduate',
    status: 'open',
    expires_at: expires60,
  },
  // Food & Agric
  {
    id: 'g1000000-0000-0000-0000-000000000007',
    poster_id: 'e1000000-0000-0000-0000-000000000003',
    poster_type: 'employer',
    title: 'Farm Supervisor — Poultry & Crop (Enugu)',
    description: 'Experienced farm supervisor needed to oversee 5,000-bird poultry unit and 3-acre vegetable plot. Must understand animal health, feeding schedules, and crop rotation. Accommodation on farm.',
    category: 'Agriculture',
    skills_required: JSON.stringify(['farming', 'poultry', 'agriculture', 'farm management']),
    budget_fixed: 65000,
    rate_type: 'per_day',
    duration_days: 90,
    location_type: 'onsite',
    state: 'Enugu',
    target_user_type: 'all',
    status: 'open',
    expires_at: expires90,
  },
  {
    id: 'g1000000-0000-0000-0000-000000000008',
    poster_id: 'e1000000-0000-0000-0000-000000000003',
    poster_type: 'employer',
    title: 'Food Packaging & Quality Control Staff',
    description: 'We are expanding our food processing unit and need 3 packaging staff. Duties include sorting, weighing, sealing, and labelling products. No experience needed — training provided.',
    category: 'Manufacturing',
    skills_required: JSON.stringify(['packaging', 'quality control', 'food processing']),
    budget_fixed: 45000,
    rate_type: 'fixed',
    duration_days: 30,
    location_type: 'onsite',
    state: 'Enugu',
    target_user_type: 'all',
    status: 'open',
    expires_at: expires30,
  },
  {
    id: 'g1000000-0000-0000-0000-000000000009',
    poster_id: 'e1000000-0000-0000-0000-000000000003',
    poster_type: 'employer',
    title: 'Truck Driver — Produce Delivery (Long Haul)',
    description: 'Experienced long-haul truck driver needed for produce deliveries between Enugu, Onitsha, and Lagos. Must hold valid class E licence and have at least 2 years long-haul experience. Vehicle provided.',
    category: 'Logistics',
    skills_required: JSON.stringify(['truck driving', 'driving', 'logistics']),
    budget_fixed: 90000,
    rate_type: 'per_day',
    duration_days: 60,
    location_type: 'onsite',
    state: 'Enugu',
    target_user_type: 'trader',
    status: 'open',
    expires_at: expires60,
  },
];

const TRADERS = [
  {
    id: 't1000000-0000-0000-0000-000000000001',
    name: 'Chukwuemeka Obi',
    phone: '08021000001',
    email: 'emeka.obi@gmail.com',
    business_type: 'Electrician',
    skills: JSON.stringify(['electrician', 'wiring', 'solar installation', 'electrical installation']),
    state: 'Lagos',
    nuban: '1234567890',
    bvn_verified: true,
    total_jobs: 14,
    total_earnings: 920000,
    rating: 4.7,
  },
  {
    id: 't1000000-0000-0000-0000-000000000002',
    name: 'Fatimah Bello',
    phone: '08021000002',
    email: 'fatimah.bello@gmail.com',
    business_type: 'Tailor',
    skills: JSON.stringify(['tailoring', 'sewing', 'fashion design', 'alterations']),
    state: 'Kano',
    nuban: '1234567891',
    bvn_verified: true,
    total_jobs: 32,
    total_earnings: 1450000,
    rating: 4.9,
  },
  {
    id: 't1000000-0000-0000-0000-000000000003',
    name: 'Sunday Adeyemi',
    phone: '08021000003',
    email: 'sunday.adeyemi@gmail.com',
    business_type: 'Plumber',
    skills: JSON.stringify(['plumber', 'plumbing', 'pipe fitting', 'borehole']),
    state: 'Ogun',
    nuban: '1234567892',
    bvn_verified: false,
    total_jobs: 7,
    total_earnings: 380000,
    rating: 4.3,
  },
];

const GRADUATES = [
  {
    id: 'gr000000-0000-0000-0000-000000000001',
    name: 'Amaka Nwosu',
    phone: '08011000001',
    email: 'amaka.nwosu@gmail.com',
    degree: 'BSc',
    field_of_study: 'Computer Science',
    graduation_year: 2023,
    university: 'University of Nigeria, Nsukka',
    skills: JSON.stringify(['python', 'data analysis', 'javascript', 'react', 'sql']),
    nuban: '2234567890',
    total_gigs: 5,
    total_earnings: 520000,
  },
  {
    id: 'gr000000-0000-0000-0000-000000000002',
    name: 'Biodun Fashola',
    phone: '08011000002',
    email: 'biodun.fashola@gmail.com',
    degree: 'HND',
    field_of_study: 'Business Administration',
    graduation_year: 2022,
    university: 'Yaba College of Technology',
    skills: JSON.stringify(['social media', 'content creation', 'microsoft excel', 'marketing', 'copywriting']),
    nuban: '2234567891',
    total_gigs: 11,
    total_earnings: 730000,
  },
  {
    id: 'gr000000-0000-0000-0000-000000000003',
    name: 'Tunde Olarewaju',
    phone: '08011000003',
    email: 'tunde.olarewaju@gmail.com',
    degree: 'BSc',
    field_of_study: 'Agricultural Economics',
    graduation_year: 2024,
    university: 'Obafemi Awolowo University',
    skills: JSON.stringify(['farming', 'agriculture', 'data entry', 'administration', 'spreadsheet']),
    nuban: '2234567892',
    total_gigs: 2,
    total_earnings: 95000,
  },
];

const OPPORTUNITIES = [
  {
    id: 'op000000-0000-0000-0000-000000000001',
    source_url_hash: 'seed001seedseed001seedseed001seedseed001seedseed001seedseed001se',
    title: 'Youth Empowerment Vocational Training — LASG (Plumbing, Electrical, Welding)',
    organization: 'Lagos State Government — TESCOM',
    description: 'Free 3-month vocational training for Lagos residents aged 18–35. Trades available: plumbing, electrical installation, welding, tiling, and AC servicing. Certificate issued on completion. Limited slots.',
    skills_required: JSON.stringify(['plumbing', 'electrician', 'welding', 'tiling']),
    opportunity_type: 'training',
    target_user_type: 'trader',
    location: 'Lagos, Nigeria',
    pay_or_stipend: 'Free training + ₦15,000/month stipend',
    deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
    external_link: 'https://tescom.lagosstate.gov.ng',
    source_platform: 'government',
    is_active: true,
  },
  {
    id: 'op000000-0000-0000-0000-000000000002',
    source_url_hash: 'seed002seedseed002seedseed002seedseed002seedseed002seedseed002se',
    title: 'Jobberman Nigeria — Graduate Trainee Programme (Multiple Sectors)',
    organization: 'Jobberman Nigeria',
    description: 'Applications open for graduate trainees in banking, FMCG, technology, and consulting. Minimum 2:1 degree required. 12-month rotational programme with competitive pay.',
    skills_required: JSON.stringify(['microsoft excel', 'communication', 'data analysis', 'administration']),
    opportunity_type: 'full_time',
    target_user_type: 'graduate',
    location: 'Lagos / Abuja / Port Harcourt',
    pay_or_stipend: '₦120,000–₦180,000/month',
    deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    external_link: 'https://jobberman.com',
    source_platform: 'jobberman',
    is_active: true,
  },
  {
    id: 'op000000-0000-0000-0000-000000000003',
    source_url_hash: 'seed003seedseed003seedseed003seedseed003seedseed003seedseed003se',
    title: 'CBN Creative Industry Financing Initiative — Artisan Loans',
    organization: 'Central Bank of Nigeria',
    description: 'Single-digit interest loans for artisans and micro-businesses in the creative sector. Trades include tailoring, hairdressing, welding, and food processing. Apply through participating microfinance banks.',
    skills_required: JSON.stringify(['tailoring', 'welding', 'food processing', 'hairdressing']),
    opportunity_type: 'grant',
    target_user_type: 'trader',
    location: 'Nationwide',
    pay_or_stipend: 'Loans up to ₦500,000 at 9% p.a.',
    deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    external_link: 'https://cbn.gov.ng',
    source_platform: 'government',
    is_active: true,
  },
  {
    id: 'op000000-0000-0000-0000-000000000004',
    source_url_hash: 'seed004seedseed004seedseed004seedseed004seedseed004seedseed004se',
    title: 'Google Africa Developer Scholarship — Web & Android Track',
    organization: 'Google via Andela',
    description: 'Fully funded online scholarship for Africans interested in web development and Android programming. 6-month course with mentorship, community support, and job placement assistance.',
    skills_required: JSON.stringify(['javascript', 'react', 'android', 'python', 'frontend']),
    opportunity_type: 'training',
    target_user_type: 'graduate',
    location: 'Remote (Nigeria eligible)',
    pay_or_stipend: 'Free scholarship',
    deadline: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    external_link: 'https://andela.com',
    source_platform: 'discovery_africa',
    is_active: true,
  },
  {
    id: 'op000000-0000-0000-0000-000000000005',
    source_url_hash: 'seed005seedseed005seedseed005seedseed005seedseed005seedseed005se',
    title: 'BOI YouWin! Connect Nigeria — SME Grant (Up to ₦10M)',
    organization: 'Bank of Industry',
    description: 'Business grant competition for young Nigerians aged 18–40 with viable business ideas or existing small businesses. Categories include agro-processing, manufacturing, and digital services.',
    skills_required: JSON.stringify(['farming', 'agriculture', 'food processing', 'manufacturing']),
    opportunity_type: 'grant',
    target_user_type: 'all',
    location: 'Nationwide',
    pay_or_stipend: 'Grants from ₦1M to ₦10M',
    deadline: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000),
    external_link: 'https://boi.ng',
    source_platform: 'government',
    is_active: true,
  },
  {
    id: 'op000000-0000-0000-0000-000000000006',
    source_url_hash: 'seed006seedseed006seedseed006seedseed006seedseed006seedseed006se',
    title: 'MyJobMag — Remote Customer Support Agents (Igbo/Yoruba/Hausa Speakers)',
    organization: 'Multiple Clients via MyJobMag',
    description: 'Openings for bilingual customer support representatives who speak Igbo, Yoruba, or Hausa alongside English. Work from home, part-time or full-time. Laptop required.',
    skills_required: JSON.stringify(['customer support', 'communication', 'data entry', 'microsoft excel']),
    opportunity_type: 'gig',
    target_user_type: 'all',
    location: 'Remote (Nigeria)',
    pay_or_stipend: '₦40,000–₦75,000/month',
    deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    external_link: 'https://myjobmag.com',
    source_platform: 'myjobmag',
    is_active: true,
  },
];

// ─── Seed runner ─────────────────────────────────────────────────────────────

async function upsertBatch(Model, records, label) {
  let created = 0;
  let skipped = 0;
  for (const record of records) {
    const [, wasCreated] = await Model.findOrCreate({ where: { id: record.id }, defaults: record });
    wasCreated ? created++ : skipped++;
  }
  console.log(`  ${label}: ${created} created, ${skipped} already existed`);
}

async function seed() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.\n');

    console.log('Seeding Employers...');
    await upsertBatch(Employer, EMPLOYERS, 'Employers');

    console.log('Seeding GigPosts...');
    await upsertBatch(GigPost, GIG_POSTS, 'GigPosts');

    console.log('Seeding Traders...');
    await upsertBatch(Trader, TRADERS, 'Traders');

    console.log('Seeding Graduates...');
    await upsertBatch(Graduate, GRADUATES, 'Graduates');

    console.log('Seeding OpportunityPool...');
    await upsertBatch(OpportunityPool, OPPORTUNITIES, 'Opportunities');

    console.log('\n✓ Seed complete.');
    console.log('  Employers : 3');
    console.log('  GigPosts  : 9 (open, realistic Nigerian jobs)');
    console.log('  Traders   : 3 (electrician, tailor, plumber)');
    console.log('  Graduates : 3 (CS, business, agric)');
    console.log('  Opportunities: 6 (training, grants, jobs)');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

seed();
