import * as logger from 'firebase-functions/logger';
import { db } from './firebase.js';
import { FIRESTORE_COLLECTIONS } from './index.js';

export interface ISeedBatch {
  id: string;
  name: string;
  subject: string;
  classLevel: string;
  targetExam: string;
  studentCount: number;
  teacherId: string;
  createdAt: string;
  updatedAt: string;
}

export interface IRubricStep {
  stepId: string;
  description: string;
  maxMarks: number;
  criteria: string;
}

export interface ISeedRubric {
  id: string;
  title: string;
  subject: string;
  totalMarks: number;
  steps: IRubricStep[];
  createdAt: string;
  updatedAt: string;
}

export const SEEDED_BATCH: ISeedBatch = {
  id: 'batch-lakshya-2026',
  name: 'Lakshya 2026',
  subject: 'Physics',
  classLevel: 'Class 12',
  targetExam: 'NEET',
  studentCount: 45,
  teacherId: 'teacher-sharma-101',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const SEEDED_RUBRIC: ISeedRubric = {
  id: 'capacitance-derivation',
  title: 'Parallel Plate Capacitor Derivation with Dielectric',
  subject: 'Physics',
  totalMarks: 20,
  steps: [
    {
      stepId: 'step-1',
      description: 'Formula & Definition',
      maxMarks: 5,
      criteria: 'Definition of capacitance (C = Q/V) and initial uniform electric field E0 = sigma / epsilon0',
    },
    {
      stepId: 'step-2',
      description: 'Derivation with integral',
      maxMarks: 10,
      criteria: 'Integration of electric field across dielectric slab V = int E dr and potential difference calculation',
    },
    {
      stepId: 'step-3',
      description: 'Final expression with units',
      maxMarks: 5,
      criteria: 'Final capacitance formula C = epsilon0 * A / (d - t + t/K) with correct Farad units stated',
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/**
 * Idempotent Firestore Seeding Service:
 * Ensures the required demo batch and rubric exist in Firestore.
 */
export async function seedFirestoreDatabase(): Promise<{ seededBatches: number; seededRubrics: number }> {
  let seededBatches = 0;
  let seededRubrics = 0;

  try {
    const batchRef = db.collection(FIRESTORE_COLLECTIONS.BATCHES).doc(SEEDED_BATCH.id);
    const batchSnap = await batchRef.get();
    if (!batchSnap.exists) {
      await batchRef.set(SEEDED_BATCH);
      logger.info(`Seeded batch: ${SEEDED_BATCH.id}`);
      seededBatches++;
    }

    const rubricRef = db.collection('rubrics').doc(SEEDED_RUBRIC.id);
    const rubricSnap = await rubricRef.get();
    if (!rubricSnap.exists) {
      await rubricRef.set(SEEDED_RUBRIC);
      logger.info(`Seeded rubric: ${SEEDED_RUBRIC.id}`);
      seededRubrics++;
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn('Seed execution warning (emulator/db may be offline or initializing):', errorMsg);
  }

  return { seededBatches, seededRubrics };
}
