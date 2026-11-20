import { addDays, addMinutes, mentionsBatch, dateInZone, evaluateDraft, IRulesContext, markingForPattern, sanitizeDraftArgs, spokenDate } from './exam-params.rules';
import { TEACHER_BATCHES } from './teacher-context';

const ctx: IRulesContext = { today: '2026-11-21', batches: TEACHER_BATCHES };

const fullExam = {
  subject: 'Physics',
  duration: 45,
  topic: 'Electrostatics',
  batchId: 'batch-lakshya-2026',
  targetQuestions: 15,
  date: '2026-11-22',
  startTime: '10:00',
};

describe('exam params rules', () => {
  it('reports every teacher-only field as missing for an empty draft', () => {
    const ev = evaluateDraft({}, ctx);
    expect(ev.missing).toEqual(['topic', 'batchId', 'subject', 'targetQuestions', 'date', 'startTime', 'duration']);
    expect(ev.complete).toBe(false);
    expect(ev.result).toBeNull();
  });

  it('fills defaults from the NEET batch and completes', () => {
    const ev = evaluateDraft(fullExam, ctx);
    expect(ev.missing).toEqual([]);
    expect(ev.invalid).toEqual([]);
    expect(ev.complete).toBe(true);
    expect(ev.result?.examParams).toMatchObject({
      batchId: 'batch-lakshya-2026',
      subject: 'Physics',
      duration: 45,
      endTime: '10:45',
      defaultMarks: 4,
      defaultNegativeMarks: 1,
      negativeRule: '1/4',
      classLevel: 'Class 12',
      examPattern: 'NEET',
      title: 'NEET Class 12 Physics: Electrostatics — Practice Test',
      languages: ['en'],
      status: 'draft',
    });
    expect(ev.result?.generation).toEqual({ intent: 'CREATE_EXAM', topic: 'Electrostatics', subtopics: [], difficulty: 'medium', questionType: 'MCQ' });
    expect(ev.defaulted).toEqual(expect.arrayContaining(['endTime', 'defaultMarks', 'title']));
    expect(ev.defaulted).not.toContain('targetQuestions');
    expect(ev.defaulted).not.toContain('subject');
    expect(ev.defaulted).not.toContain('duration');
  });

  it('uses board marking (1/0, no negative) for the CBSE batch', () => {
    const ev = evaluateDraft({ ...fullExam, batchId: 'batch-class10-a', topic: 'Linear Motion' }, ctx);
    expect(ev.result?.examParams).toMatchObject({ defaultMarks: 1, defaultNegativeMarks: 0, negativeRule: 'none', classLevel: 'Class 10' });
  });

  it('accepts any subject, never infers it from the batch, and writes Hindi papers in Hindi', () => {
    const { subject, ...noSubject } = fullExam;
    expect(subject).toBe('Physics');
    expect(evaluateDraft(noSubject, ctx).missing).toEqual(['subject']);

    const hindi = evaluateDraft({ ...fullExam, batchId: 'batch-class10-a', subject: 'Hindi', topic: 'Alankar' }, ctx);
    expect(hindi.complete).toBe(true);
    expect(hindi.result?.examParams).toMatchObject({ subject: 'Hindi', languages: ['hi'], primaryLanguage: 'hi' });
    expect(evaluateDraft({ ...fullExam, subject: 'Accountancy' }, ctx).result?.examParams.languages).toEqual(['en']);
  });

  it('DPP only needs subject, topic, batch and start time', () => {
    const ev = evaluateDraft({ intent: 'AUTO_DPP', subject: 'Physics', topic: 'Doppler Effect', batchId: 'batch-lakshya-2026' }, ctx);
    expect(ev.missing).toEqual(['startTime']);
    const done = evaluateDraft({ intent: 'AUTO_DPP', subject: 'Physics', topic: 'Doppler Effect', batchId: 'batch-lakshya-2026', startTime: '18:00' }, ctx);
    expect(done.result?.examParams).toMatchObject({ targetQuestions: 7, duration: 20, date: '2026-11-21', endTime: '18:20' });
    expect(done.result?.examParams.title).toContain('Daily Practice Problems');
  });

  it('rejects a DPP outside 5–10 questions', () => {
    const ev = evaluateDraft({ intent: 'AUTO_DPP', subject: 'Physics', topic: 'Optics', batchId: 'batch-lakshya-2026', startTime: '18:00', targetQuestions: 25 }, ctx);
    expect(ev.invalid).toEqual([{ field: 'targetQuestions', issue: 'Number of questions must be between 5 and 10' }]);
  });

  it('flags past dates, impossible dates, bad times and unknown batches', () => {
    expect(evaluateDraft({ ...fullExam, date: '2026-11-20' }, ctx).invalid[0].field).toBe('date');
    expect(evaluateDraft({ ...fullExam, date: '2026-02-30' }, ctx).invalid[0].issue).toContain('real calendar date');
    expect(evaluateDraft({ ...fullExam, startTime: '25:00' }, ctx).invalid.map((i) => i.field)).toContain('startTime');
    expect(evaluateDraft({ ...fullExam, batchId: 'batch-made-up' }, ctx).invalid[0]).toMatchObject({ field: 'batchId' });
  });

  it('checks the window against the duration and negative vs positive marks', () => {
    expect(evaluateDraft({ ...fullExam, endTime: '09:00' }, ctx).invalid[0].issue).toContain('after start time');
    expect(evaluateDraft({ ...fullExam, endTime: '10:30' }, ctx).invalid[0].issue).toContain('shorter than the duration');
    expect(evaluateDraft({ ...fullExam, defaultMarks: 4, defaultNegativeMarks: 5 }, ctx).invalid[0].field).toBe('defaultNegativeMarks');
    expect(evaluateDraft({ ...fullExam, startTime: '23:30' }, ctx).invalid[0].issue).toContain('past midnight');
  });

  it('adds minutes within a day only', () => {
    expect(addMinutes('10:00', 45)).toBe('10:45');
    expect(addMinutes('09:50', 70)).toBe('11:00');
    expect(addMinutes('23:30', 45)).toBeNull();
    expect(addMinutes('bad', 5)).toBeNull();
  });

  it('formats today in the institute timezone', () => {
    // 20:00 UTC is already the next day in IST (UTC+5:30).
    expect(dateInZone(new Date('2026-11-20T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-11-21');
  });

  it('maps exam patterns to marking schemes', () => {
    expect(markingForPattern('JEE Main').negativeRule).toBe('1/4');
    expect(markingForPattern('CBSE').defaultNegativeMarks).toBe(0);
    expect(markingForPattern(undefined).defaultMarks).toBe(1);
  });

  it('sanitizes untrusted tool arguments', () => {
    const patch = sanitizeDraftArgs({
      intent: 'HACK',
      topic: '  Linear Motion ',
      targetQuestions: '12',
      duration: 'forty',
      difficulty: 'hard',
      subtopics: ['Velocity', 3, ''],
      extra: 'ignored',
    });
    expect(patch).toEqual({ topic: 'Linear Motion', targetQuestions: 12, difficulty: 'hard', subtopics: ['Velocity'] });
    expect(sanitizeDraftArgs(null)).toEqual({});
  });

  it('resolves relativeDay in code, overriding any date the model guessed', () => {
    expect(sanitizeDraftArgs({ relativeDay: 1, date: '2026-11-21' }, '2026-11-21').date).toBe('2026-11-22');
    expect(sanitizeDraftArgs({ relativeDay: 0 }, '2026-12-31').date).toBe('2026-12-31');
    expect(sanitizeDraftArgs({ relativeDay: 1 }, '2026-12-31').date).toBe('2027-01-01');
    expect(sanitizeDraftArgs({ relativeDay: -3, date: '2026-11-25' }, '2026-11-21').date).toBe('2026-11-25');
    expect(sanitizeDraftArgs({ relativeDay: 1 }).date).toBeUndefined();
  });

  it('gives the agent a spoken date for the read-back', () => {
    expect(spokenDate('2026-11-22')).toBe('Sunday, 22 November 2026');
    expect(spokenDate('2026-02-30')).toBeUndefined();
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('recognises a named batch in English, Hinglish and Devanagari transcripts, but not a bare class', () => {
    const aliases = ['section a', '10 a', 'सेक्शन ए'];
    expect(mentionsBatch('Section-A ke liye', aliases)).toBe(true);
    expect(mentionsBatch('class 10 A wale bachchon ka', aliases)).toBe(true);
    expect(mentionsBatch('सेक्शन ए के लिए', aliases)).toBe(true);
    expect(mentionsBatch('class 10 ka paper', aliases)).toBe(false);
    expect(mentionsBatch('a section of the syllabus', aliases)).toBe(false);
  });

  it('rejects a start time that has already passed today, but not tomorrow', () => {
    const now = { ...ctx, nowTime: '15:00' };
    const today = { ...fullExam, date: '2026-11-21', startTime: '09:00' };
    expect(evaluateDraft(today, now).invalid[0]).toMatchObject({ field: 'startTime' });
    expect(evaluateDraft({ ...today, startTime: '16:00' }, now).complete).toBe(true);
    expect(evaluateDraft({ ...today, date: '2026-11-22' }, now).complete).toBe(true);
  });

  it('treats an empty numeric string as missing, not zero', () => {
    expect(sanitizeDraftArgs({ targetQuestions: '', duration: ' ' })).toEqual({});
  });

  it('never defaults the duration of an exam: it is required until the teacher states it', () => {
    const { duration, ...noDuration } = fullExam;
    expect(duration).toBe(45);
    const ev = evaluateDraft(noDuration, ctx);
    expect(ev.missing).toEqual(['duration']);
    expect(ev.examParams.duration).toBeUndefined();
    expect(ev.examParams.endTime).toBeUndefined();
    expect(ev.complete).toBe(false);
  });

  it('takes the duration from an explicit start and end time ("10 se 11 baje"), without a default tag', () => {
    const { duration, ...noDuration } = fullExam;
    expect(duration).toBe(45);
    const ev = evaluateDraft({ ...noDuration, startTime: '10:00', endTime: '11:00' }, ctx);
    expect(ev.missing).toEqual([]);
    expect(ev.examParams).toMatchObject({ duration: 60, endTime: '11:00' });
    expect(ev.defaulted).not.toContain('duration');
    expect(evaluateDraft({ ...noDuration, startTime: '10:00', endTime: '09:00' }, ctx).missing).toContain('duration');
  });
});
