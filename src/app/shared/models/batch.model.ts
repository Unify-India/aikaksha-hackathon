export interface ISubject {
  id: string;
  name: string;
  code?: string;
  topics?: string[];
}

export interface IBatch {
  id: string;
  name: string;
  code: string;
  classLevel: string;
  subjects: ISubject[];
  assignedTeacherIds: string[];
  studentCount: number;
  examPattern?: string;
  academicYear?: string;
}
