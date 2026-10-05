import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  addDoc, 
  query as fsQuery, 
  where, 
  orderBy, 
  limit, 
  serverTimestamp 
} from "firebase/firestore";
import { db } from "@/firebase";

export interface PatientRecord {
  id: string; // Document ID (PT-XXXXXX)
  patientId: string; // Permanent Unique ID e.g. "PT-000123"
  patient_id: string; // Alias for backward compatibility
  name: string; // Full Name
  full_name: string; // Alias
  mobile: string; // Current Mobile Number
  dob?: string; // Date of Birth YYYY-MM-DD
  age?: number;
  gender?: string;
  address?: string;
  marital_status?: string;
  education?: string;
  occupation?: string;
  parents_occupation?: string;
  createdAt?: string;
  updatedAt?: string;
  lastVisit?: string;
  latestCaseId?: string;
  latestCasePaperId?: string;
}

/**
 * Format a number into standard permanent Patient ID: PT-000001, PT-000002, etc.
 */
export function formatPatientId(num: number): string {
  return `PT-${String(num).padStart(6, "0")}`;
}

/**
 * Format a Case Paper ID: CP-2026-0001, CP-2026-0002, etc.
 */
export function formatCasePaperId(year: number, num: number): string {
  return `CP-${year}-${String(num).padStart(4, "0")}`;
}

/**
 * Mask mobile number for duplicate safety display (e.g. 9876543210 -> ******3210)
 */
export function maskMobile(mobile: string | undefined | null): string {
  if (!mobile) return "******----";
  const clean = mobile.replace(/\D/g, "");
  if (clean.length < 4) return "******";
  return `******${clean.slice(-4)}`;
}

/**
 * Safely generate the next sequential Patient ID without collisions.
 */
export async function getNextPatientId(): Promise<string> {
  let highestNum = 0;

  try {
    // 1. Check existing patients collection
    const patientsSnap = await getDocs(collection(db, "patients"));
    patientsSnap.forEach((d) => {
      const data = d.data();
      const pid = (data.patientId || data.patient_id || d.id || "").toString();
      const match = pid.match(/^PT-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > highestNum) highestNum = num;
      }
    });

    // 2. Also check case_papers for any existing PT- IDs
    const casesSnap = await getDocs(collection(db, "case_papers"));
    casesSnap.forEach((d) => {
      const data = d.data();
      const pid = (data.patient_id || data.patientId || "").toString();
      const match = pid.match(/^PT-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > highestNum) highestNum = num;
      }
    });
  } catch (err) {
    console.warn("Could not query existing patient numbers, starting from 1:", err);
  }

  // Ensure unique by incrementing until an unused ID is found in Firestore
  let nextNum = highestNum + 1;
  let candidateId = formatPatientId(nextNum);
  
  // Guard loop to verify document does not already exist
  let exists = true;
  let safetyCounter = 0;
  while (exists && safetyCounter < 50) {
    safetyCounter++;
    try {
      const checkDoc = await getDoc(doc(db, "patients", candidateId));
      if (!checkDoc.exists()) {
        exists = false;
      } else {
        nextNum++;
        candidateId = formatPatientId(nextNum);
      }
    } catch {
      exists = false;
    }
  }

  return candidateId;
}

/**
 * Safely generate the next sequential Case Paper ID (e.g. CP-2026-0001).
 */
export async function getNextCasePaperId(): Promise<string> {
  const currentYear = new Date().getFullYear();
  let highestNum = 0;

  try {
    const casesSnap = await getDocs(collection(db, "case_papers"));
    casesSnap.forEach((d) => {
      const data = d.data();
      const cid = (data.case_paper_id || data.casePaperId || "").toString();
      // Match CP-YYYY-XXXX or CP-XXXX
      const match = cid.match(/CP-(?:\d{4}-)?(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > highestNum) highestNum = num;
      }
    });
  } catch (err) {
    console.warn("Could not query existing case numbers:", err);
  }

  return formatCasePaperId(currentYear, highestNum + 1);
}

/**
 * Register a brand new patient or get an existing patient record.
 */
export async function createPatientRecord(data: {
  name: string;
  mobile: string;
  dob?: string;
  age?: number;
  gender?: string;
  address?: string;
  marital_status?: string;
  education?: string;
  occupation?: string;
  parents_occupation?: string;
  customPatientId?: string;
}): Promise<PatientRecord> {
  const patientId = data.customPatientId || (await getNextPatientId());
  const now = new Date().toISOString();

  const patientRecord: PatientRecord = {
    id: patientId,
    patientId: patientId,
    patient_id: patientId,
    name: data.name.trim(),
    full_name: data.name.trim(),
    mobile: data.mobile.trim(),
    dob: data.dob || "",
    age: Number(data.age) || 0,
    gender: data.gender || "Male",
    address: data.address || "",
    marital_status: data.marital_status || "Unmarried",
    education: data.education || "",
    occupation: data.occupation || "",
    parents_occupation: data.parents_occupation || "",
    createdAt: now,
    updatedAt: now,
    lastVisit: now,
  };

  // Save to patients collection with patientId as the primary key
  await setDoc(doc(db, "patients", patientId), patientRecord, { merge: true });

  return patientRecord;
}

/**
 * Update an existing patient's current mobile number.
 * Patient ID remains 100% UNCHANGED.
 * Historical case papers remain linked to the permanent patientId.
 */
export async function updatePatientMobileNumber(patientId: string, newMobile: string): Promise<void> {
  const cleanMobile = newMobile.trim();
  const now = new Date().toISOString();

  // 1. Update in patients collection
  const patientRef = doc(db, "patients", patientId);
  await updateDoc(patientRef, {
    mobile: cleanMobile,
    updatedAt: now,
  });

  // 2. Also update latest active case paper if available
  try {
    const activeCaseQuery = fsQuery(
      collection(db, "case_papers"),
      where("patient_id", "==", patientId)
    );
    const snap = await getDocs(activeCaseQuery);
    // Find the latest case paper and update contact info
    if (!snap.empty) {
      let latestDoc = snap.docs[0];
      let latestTime = new Date(latestDoc.data().created_at || 0).getTime();
      snap.docs.forEach((d) => {
        const t = new Date(d.data().created_at || 0).getTime();
        if (t > latestTime) {
          latestTime = t;
          latestDoc = d;
        }
      });
      await updateDoc(doc(db, "case_papers", latestDoc.id), {
        mobile: cleanMobile,
        updated_at: now,
      });
    }
  } catch (err) {
    console.warn("Could not update mobile in latest case paper:", err);
  }
}

/**
 * Search patients by:
 * 1. Patient ID (e.g. PT-000123)
 * 2. Patient Name (case-insensitive, shows list for duplicate name safety)
 * 3. Mobile Number (digits search)
 */
export async function searchPatients(
  searchQuery: string,
  preloadedCases?: any[]
): Promise<PatientRecord[]> {
  const queryTrimmed = searchQuery.trim();
  if (!queryTrimmed) return [];

  const queryLower = queryTrimmed.toLowerCase();
  const queryDigits = queryTrimmed.replace(/\D/g, "");
  const isIdSearch = /^PT-?\d+/i.test(queryTrimmed);

  // Map to hold unique patient profiles keyed by patientId
  const patientMap = new Map<string, PatientRecord>();

  // 1. Fetch from 'patients' collection
  try {
    const patientsSnap = await getDocs(collection(db, "patients"));
    patientsSnap.forEach((d) => {
      const data = d.data() as PatientRecord;
      const pid = data.patientId || data.patient_id || d.id;
      if (pid) {
        patientMap.set(pid, {
          ...data,
          id: pid,
          patientId: pid,
          patient_id: pid,
          name: data.name || data.full_name || "Unknown Patient",
          full_name: data.full_name || data.name || "Unknown Patient",
          mobile: data.mobile || "",
        });
      }
    });
  } catch (err) {
    console.warn("Failed to fetch patients collection directly:", err);
  }

  // 2. Also index from case_papers to ensure 100% backward compatibility
  // Any existing case paper without an explicit 'patients' document is automatically represented
  const casesToScan = preloadedCases && preloadedCases.length > 0 
    ? preloadedCases 
    : await getDocs(collection(db, "case_papers")).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []);

  casesToScan.forEach((c: any) => {
    const pid = c.patient_id || c.patientId || `PT-LEGACY-${(c.id || "").slice(0, 6)}`;
    if (!patientMap.has(pid)) {
      patientMap.set(pid, {
        id: pid,
        patientId: pid,
        patient_id: pid,
        name: c.full_name || "Unknown Patient",
        full_name: c.full_name || "Unknown Patient",
        mobile: c.mobile || "",
        dob: c.dob || "",
        age: c.age || 0,
        gender: c.gender || "Male",
        address: c.address || "",
        createdAt: c.created_at || new Date().toISOString(),
        updatedAt: c.updated_at || c.created_at || new Date().toISOString(),
        lastVisit: c.created_at || new Date().toISOString(),
        latestCaseId: c.id,
        latestCasePaperId: c.case_paper_id || c.casePaperId || c.id,
      });
    } else {
      // Update lastVisit if this case paper is newer
      const existing = patientMap.get(pid)!;
      const existingTime = new Date(existing.lastVisit || 0).getTime();
      const thisTime = new Date(c.created_at || 0).getTime();
      if (thisTime > existingTime) {
        existing.lastVisit = c.created_at;
        existing.latestCaseId = c.id;
        existing.latestCasePaperId = c.case_paper_id || c.casePaperId || c.id;
        // Keep current mobile if latest case has one
        if (c.mobile && !existing.mobile) {
          existing.mobile = c.mobile;
        }
      }
    }
  });

  const allPatients = Array.from(patientMap.values());

  // 3. Filter matching records based on search query
  const results = allPatients.filter((p) => {
    const pId = (p.patientId || p.patient_id || "").toLowerCase();
    const pName = (p.name || p.full_name || "").toLowerCase();
    const pMobile = (p.mobile || "").replace(/\D/g, "");

    // 1. Patient ID Search
    if (isIdSearch) {
      const normalizedQuery = queryTrimmed.replace(/\s+/g, "").toUpperCase();
      const normalizedPid = (p.patientId || p.patient_id || "").replace(/\s+/g, "").toUpperCase();
      return normalizedPid.includes(normalizedQuery);
    }

    // 2. Mobile Number Search
    if (queryDigits.length >= 3 && pMobile.includes(queryDigits)) {
      return true;
    }

    // 3. Name Search (Case-insensitive substring)
    if (pName.includes(queryLower)) {
      return true;
    }

    // Also check partial ID match if query contains alphanumeric
    if (pId.includes(queryLower)) {
      return true;
    }

    return false;
  });

  // Sort results: exact ID matches first, then newest visit first
  results.sort((a, b) => {
    if (isIdSearch) {
      const aExact = (a.patientId || "").toUpperCase() === queryTrimmed.toUpperCase();
      const bExact = (b.patientId || "").toUpperCase() === queryTrimmed.toUpperCase();
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
    }
    const timeA = new Date(a.lastVisit || a.createdAt || 0).getTime();
    const timeB = new Date(b.lastVisit || b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  return results;
}

/**
 * Fetch all Case Papers belonging to a specific Patient ID.
 * Returns sorted newest first.
 */
export async function getCasePapersForPatient(
  patientId: string,
  preloadedCases?: any[]
): Promise<any[]> {
  if (!patientId) return [];

  const foundMap = new Map<string, any>();

  // 1. If preloaded cases are available, filter first
  if (preloadedCases && preloadedCases.length > 0) {
    preloadedCases.forEach((c) => {
      const cPid = c.patient_id || c.patientId;
      if (cPid && cPid === patientId) {
        foundMap.set(c.id, c);
      }
    });
  }

  // 2. Query Firestore directly to ensure full coverage
  try {
    const qPid = fsQuery(
      collection(db, "case_papers"),
      where("patient_id", "==", patientId)
    );
    const snap = await getDocs(qPid);
    snap.forEach((d) => foundMap.set(d.id, { id: d.id, ...d.data() }));
  } catch (err) {
    console.warn("Firestore patient_id query failed:", err);
  }

  // 3. Convert to array and sort newest first
  const cases = Array.from(foundMap.values());
  cases.sort((a, b) => {
    const timeA = new Date(a.created_at || 0).getTime();
    const timeB = new Date(b.created_at || 0).getTime();
    return timeB - timeA;
  });

  return cases;
}
