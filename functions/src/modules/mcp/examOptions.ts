/**
 * Choices for the guided "create exam" conversation, in the order the AI should ask:
 * batch → subject → topic → questions & difficulty → date & time → marking.
 * Batches come from Firestore; the rest are fixed lists (NCERT Class 11–12 chapter names).
 *
 * Owner: Sakshi.
 */

export const ASK_ORDER = [
  'batch (existing, or "Create a new batch")',
  'subject (skip if the batch has one)',
  'topic',
  'questionCount',
  'difficulty',
  'date',
  'startTime',
  'durationOrEndTime',
  'marking',
] as const;

/** NCERT Class 11 + 12 chapter names, used as topic suggestions (teachers may type any topic). */
export const TOPICS_BY_SUBJECT: Record<string, string[]> = {
  Physics: [
    'Units and Measurements', 'Motion in a Straight Line', 'Motion in a Plane', 'Laws of Motion',
    'Work, Energy and Power', 'System of Particles and Rotational Motion', 'Gravitation',
    'Mechanical Properties of Solids', 'Mechanical Properties of Fluids', 'Thermal Properties of Matter',
    'Thermodynamics', 'Kinetic Theory', 'Oscillations', 'Waves',
    'Electric Charges and Fields', 'Electrostatic Potential and Capacitance', 'Current Electricity',
    'Moving Charges and Magnetism', 'Magnetism and Matter', 'Electromagnetic Induction', 'Alternating Current',
    'Electromagnetic Waves', 'Ray Optics and Optical Instruments', 'Wave Optics',
    'Dual Nature of Radiation and Matter', 'Atoms', 'Nuclei', 'Semiconductor Electronics',
  ],
  Chemistry: [
    'Some Basic Concepts of Chemistry', 'Structure of Atom', 'Classification of Elements and Periodicity',
    'Chemical Bonding and Molecular Structure', 'Thermodynamics', 'Equilibrium', 'Redox Reactions',
    'Organic Chemistry: Basic Principles and Techniques', 'Hydrocarbons', 'Solutions', 'Electrochemistry',
    'Chemical Kinetics', 'The d- and f-Block Elements', 'Coordination Compounds', 'Haloalkanes and Haloarenes',
    'Alcohols, Phenols and Ethers', 'Aldehydes, Ketones and Carboxylic Acids', 'Amines', 'Biomolecules',
  ],
  Biology: [
    'The Living World', 'Biological Classification', 'Plant Kingdom', 'Animal Kingdom',
    'Morphology of Flowering Plants', 'Anatomy of Flowering Plants', 'Structural Organisation in Animals',
    'Cell: The Unit of Life', 'Biomolecules', 'Cell Cycle and Cell Division', 'Photosynthesis in Higher Plants',
    'Respiration in Plants', 'Plant Growth and Development', 'Breathing and Exchange of Gases',
    'Body Fluids and Circulation', 'Excretory Products and their Elimination', 'Locomotion and Movement',
    'Neural Control and Coordination', 'Chemical Coordination and Integration', 'Sexual Reproduction in Flowering Plants',
    'Human Reproduction', 'Reproductive Health', 'Principles of Inheritance and Variation', 'Molecular Basis of Inheritance',
    'Evolution', 'Human Health and Disease', 'Microbes in Human Welfare', 'Biotechnology: Principles and Processes',
    'Biotechnology and its Applications', 'Organisms and Populations', 'Ecosystem', 'Biodiversity and its Conservation',
  ],
  Mathematics: [
    'Sets', 'Relations and Functions', 'Trigonometric Functions', 'Complex Numbers and Quadratic Equations',
    'Linear Inequalities', 'Permutations and Combinations', 'Binomial Theorem', 'Sequences and Series',
    'Straight Lines', 'Conic Sections', 'Introduction to Three Dimensional Geometry', 'Limits and Derivatives',
    'Statistics', 'Probability', 'Inverse Trigonometric Functions', 'Matrices', 'Determinants',
    'Continuity and Differentiability', 'Application of Derivatives', 'Integrals', 'Application of Integrals',
    'Differential Equations', 'Vector Algebra', 'Three Dimensional Geometry', 'Linear Programming',
  ],
};

export const MARKING_SCHEMES = [
  { label: 'NEET/JEE: +4 / −1', marks: 4, negativeRule: '1/4' },
  { label: '+4, no negative', marks: 4, negativeRule: 'none' },
  { label: 'Board/School: +1, no negative', marks: 1, negativeRule: 'none' },
  { label: '+2 / −0.5', marks: 2, negativeRule: '1/4' },
] as const;

export interface BatchOption {
  id: string;
  name: string;
  subject?: string;
  classLevel?: string;
  targetExam?: string;
  studentCount?: number;
}

/** Everything the AI needs to offer real choices, step by step. */
export function buildExamOptions(batches: BatchOption[], subjects: string[]) {
  return {
    askOrder: ASK_ORDER,
    guidance:
      'Ask ONE question at a time in askOrder, offering the options below as choices. ' +
      'BATCH: offer each existing batch plus "Create a new batch" (not "other"). If the teacher picks "Create a new ' +
      'batch", ask its name, class, target exam, subject and (optionally) number of students, call create_batch, ' +
      'then continue with that batch. ' +
      'SUBJECT: the chosen batch already has a subject -> use it and do NOT ask. Ask only if the batch has no ' +
      'subject or the teacher says the exam is for a different subject. ' +
      'SHORTCUT: if any answer contains several settings or a whole request, call understand_exam_request on it, ' +
      'keep everything found, skip those questions and ask only what is missing; if nothing is missing, call ' +
      'create_ai_exam immediately (it creates a draft). ' +
      'Do not assume a batch or topic and do not invent presets. When everything is known, call create_ai_exam ' +
      'with the structured fields and then show a short summary.',
    batches: batches.map((b) => ({
      batchId: b.id,
      name: b.name,
      ...(b.classLevel && { classLevel: b.classLevel }),
      ...(b.targetExam && { targetExam: b.targetExam }),
      ...(b.subject && { subject: b.subject }),
      ...(b.studentCount !== undefined && { students: b.studentCount }),
    })),
    createNewBatchOption: {
      label: 'Create a new batch',
      askFor: ['name', 'classLevel', 'targetExam', 'subject', 'studentCount (optional)'],
      classLevels: ['Class 9', 'Class 10', 'Class 11', 'Class 12', 'Dropper'],
      targetExams: ['NEET', 'JEE', 'CBSE', 'ICSE', 'State Board', 'Other'],
      tool: 'create_batch',
    },
    subjects,
    topicsBySubject: Object.fromEntries(subjects.filter((s) => TOPICS_BY_SUBJECT[s]).map((s) => [s, TOPICS_BY_SUBJECT[s]])),
    questionCount: { min: 1, max: 15, suggestions: [5, 10, 15] },
    difficulty: ['easy', 'medium', 'hard'],
    examPatterns: ['NEET', 'JEE', 'CBSE', 'ICSE', 'Custom'],
    durationMinutes: { suggestions: [15, 30, 45, 60, 90, 180] },
    dateExamples: ['today', 'tomorrow', 'next Monday', '25 November 2026'],
    timeExamples: ['10:00 AM', '2:30 PM'],
    marking: MARKING_SCHEMES,
  };
}
