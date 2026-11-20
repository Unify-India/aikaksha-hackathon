import * as functions from 'firebase-functions/v1';
import { DEPLOYMENT_REGION, FIRESTORE_COLLECTIONS } from '../../config/index.js';
import * as logger from 'firebase-functions/logger';

/**
 * Triggered on write/update to any exam document in master_exams.
 * Automatically transitions status from upcoming to live when within 5 minutes of start.
 * Matches abhyas trigger architecture.
 */
export const onExamWrite = functions
  .region(DEPLOYMENT_REGION)
  .firestore.document(`${FIRESTORE_COLLECTIONS.MASTER_EXAMS}/{examId}`)
  .onWrite(async (change, context) => {
    const examId = context.params.examId;
    const newData = change.after.exists ? change.after.data() : null;
    const oldData = change.before.exists ? change.before.data() : null;

    if (!newData) {
      logger.info(`Exam ${examId} was deleted.`);
      return null;
    }

    // Check if the status has transitioned to or is 'upcoming'
    if (newData.status === 'upcoming') {
      const nowTime = Date.now();
      const startMs = newData.startTimestampMs;
      if (startMs) {
        const timeDiff = startMs - nowTime;
        if (timeDiff <= 5 * 60 * 1000) {
          const nowIso = new Date(nowTime).toISOString();
          await change.after.ref.update({
            status: 'live',
            updatedAt: nowIso,
          });
          logger.info(
            `Exam ${examId} starts in 5 mins or less (${Math.round(timeDiff / 1000)}s). ` +
              'Transitioned status to live immediately.',
          );
        } else if (oldData?.status !== 'upcoming') {
          logger.info(
            `Exam ${examId} status updated to upcoming. ` +
              `Start: ${newData.startTime} (${newData.startTimestampMs}ms), ` +
              `End: ${newData.endTime} (${newData.endTimestampMs}ms)`,
          );
        }
      }
    }

    return null;
  });
