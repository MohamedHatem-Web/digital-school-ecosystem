// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Multi-School Tablet & IMEI Management Service (Cloud Firestore)
// ==========================================================================

import {
  db,
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
} from '../firebase.js';
import { DEFAULT_SCHOOL_ID } from './school-service.js';
import { recordAuditEvent } from './audit-service.js';

const CACHE_DEVICES_KEY = 'dse_tablet_devices_v5_';
const CACHE_BATCHES_KEY = 'dse_tablet_batches_v5_';

// --------------------------------------------------------------------------
// 1. Batches Management
// --------------------------------------------------------------------------

export const DEFAULT_BATCHES = [
  {
    id: 'batch_2026_01',
    batchNumber: 'إشارة وزارية رقم 412/2026',
    academicYear: '2026/2027',
    receivedQuantity: 150,
    registeredCount: 2,
    activatedCount: 2,
    deliveredCount: 2,
    notes: 'دفعة أجهزة التابلت لطلاب الصف الأول الثانوي — تم تسليم أجهزة الطالبين يوسف ومريم بمحاضر رسمية',
    receivedDate: '2026-09-15',
    operatorName: 'م. حسام الدين عبد العزيز',
    schoolId: DEFAULT_SCHOOL_ID,
  }
];

export async function getTabletBatches(schoolId = DEFAULT_SCHOOL_ID) {
  try {
    const batchesCol = collection(db, 'schools', schoolId, 'batches');
    const snapshot = await getDocs(batchesCol);
    if (!snapshot.empty) {
      const list = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });

      localStorage.setItem(`${CACHE_BATCHES_KEY}${schoolId}`, JSON.stringify(list));
      return list;
    }
  } catch (err) {
    console.warn('Firestore getTabletBatches notice (cache fallback):', err);
  }

  const cachedStr = localStorage.getItem(`${CACHE_BATCHES_KEY}${schoolId}`);
  if (cachedStr) {
    try {
      const parsed = JSON.parse(cachedStr);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      // ignore
    }
  }

  const initialBatches = DEFAULT_BATCHES.map(b => ({ ...b, schoolId }));
  localStorage.setItem(`${CACHE_BATCHES_KEY}${schoolId}`, JSON.stringify(initialBatches));
  return initialBatches;
}

export async function createTabletBatch({ batchNumber, academicYear, receivedQuantity, notes, operatorName }, schoolId = DEFAULT_SCHOOL_ID) {
  const cleanNumber = String(batchNumber).trim();
  if (!cleanNumber) {
    throw new Error('يرجى تحديد رقم أو إشارة دفعة الاستلام الوزارية.');
  }

  const batchId = `batch_${Date.now()}`;
  const batchData = {
    id: batchId,
    batchNumber: cleanNumber,
    academicYear: academicYear || '2026/2027',
    receivedQuantity: Number(receivedQuantity) || 0,
    registeredCount: 0,
    activatedCount: 0,
    deliveredCount: 0,
    notes: notes || '',
    receivedDate: new Date().toISOString().split('T')[0],
    operatorName: operatorName || 'مسؤول التطوير التكنولوجي',
    schoolId,
  };

  try {
    const batchRef = doc(db, 'schools', schoolId, 'batches', batchId);
    await setDoc(batchRef, {
      ...batchData,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Firestore createTabletBatch notice:', err);
  }

  // Update local cache
  const existing = await getTabletBatches(schoolId);
  const updated = [batchData, ...existing];
  localStorage.setItem(`${CACHE_BATCHES_KEY}${schoolId}`, JSON.stringify(updated));

  await recordAuditEvent({
    action: 'تسجيل دفعة استلام تابلت وزارية',
    target: `دفعة رقم ${cleanNumber}`,
    details: `الكمية المستلمة: ${batchData.receivedQuantity} جهاز`,
    operatorRole: 'tech_specialist',
    schoolId,
  });

  return batchData;
}

// --------------------------------------------------------------------------
// 2. Devices & IMEI Management
// --------------------------------------------------------------------------

export const DEFAULT_DEVICES = [
  {
    id: 'dev_354892109876543',
    imei: '354892109876543',
    serialNumber: 'TAB-2026-EGY-0981',
    batchId: 'دفعة سبتمبر 2026',
    model: 'تابلت مدرسي معتمد (سامسونج T505)',
    status: 'delivered',
    assignedStudentCode: '2026101',
    assignedStudentName: 'يوسف أحمد المنشاوي',
    deliveredDate: '2026-10-15',
    deliveredBy: 'م. حسام الدين عبد العزيز',
    schoolId: DEFAULT_SCHOOL_ID,
    registeredAt: '2026-10-01',
    history: [
      {
        action: 'حصر في المخزن المدرسي',
        timestamp: '2026-10-01',
        details: 'تم الفحص والتسجيل برقم IMEI الفعلي',
      },
      {
        action: 'تسليم رسمي ومحضر استلام',
        timestamp: '2026-10-15',
        details: 'تم التسليم للطالب: يوسف أحمد المنشاوي (كود: 2026101) بموجب محضر استلام معتمد',
      }
    ],
  },
  {
    id: 'dev_354892109876544',
    imei: '354892109876544',
    serialNumber: 'TAB-2026-EGY-0982',
    batchId: 'دفعة سبتمبر 2026',
    model: 'تابلت مدرسي معتمد (سامسونج T505)',
    status: 'delivered',
    assignedStudentCode: '2026102',
    assignedStudentName: 'مريم أحمد المنشاوي',
    deliveredDate: '2026-10-18',
    deliveredBy: 'م. حسام الدين عبد العزيز',
    schoolId: DEFAULT_SCHOOL_ID,
    registeredAt: '2026-10-01',
    history: [
      {
        action: 'حصر في المخزن المدرسي',
        timestamp: '2026-10-01',
        details: 'تم الفحص والتسجيل برقم IMEI الفعلي',
      },
      {
        action: 'تسليم رسمي ومحضر استلام',
        timestamp: '2026-10-18',
        details: 'تم التسليم للطالبة: مريم أحمد المنشاوي (كود: 2026102) بموجب محضر استلام معتمد',
      }
    ],
  }
];

export async function getTabletDevices(schoolId = DEFAULT_SCHOOL_ID) {
  const cacheKey = `${CACHE_DEVICES_KEY}${schoolId}`;
  const cachedStr = localStorage.getItem(cacheKey);

  if (cachedStr) {
    try {
      const parsed = JSON.parse(cachedStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Sync in background
        try {
          getDocs(collection(db, 'schools', schoolId, 'devices')).then((snapshot) => {
            if (!snapshot.empty) {
              const list = [];
              snapshot.forEach((docSnap) => list.push({ id: docSnap.id, ...docSnap.data() }));
              localStorage.setItem(cacheKey, JSON.stringify(list));
            }
          }).catch(() => {});
        } catch (e) {}
        return parsed;
      }
    } catch (e) {
      // ignore
    }
  }

  const initialDevices = DEFAULT_DEVICES.map(d => ({ ...d, schoolId }));
  localStorage.setItem(cacheKey, JSON.stringify(initialDevices));

  try {
    for (const dev of initialDevices) {
      const docRef = doc(db, 'schools', schoolId, 'devices', dev.id);
      setDoc(docRef, { ...dev, createdAt: serverTimestamp() }, { merge: true }).catch(() => {});
    }
  } catch (e) {
    // ignore
  }

  return initialDevices;
}

export async function registerTabletDevice({ imei, serialNumber, batchId, model }, schoolId = DEFAULT_SCHOOL_ID) {
  const cleanImei = String(imei).trim();
  if (!cleanImei || cleanImei.length < 14) {
    throw new Error('رقم IMEI غير صحيح، يجب أن يتكون من 14 إلى 15 رقماً.');
  }

  const devices = await getTabletDevices(schoolId);

  // Strict duplicate prevention across the school
  const exists = devices.some((d) => d.imei === cleanImei);
  if (exists) {
    throw new Error(`رقم IMEI (${cleanImei}) مسجل بالفعل مسبقاً في قاعدة بيانات المدرسة.`);
  }

  const deviceId = `dev_${cleanImei}`;
  const deviceData = {
    id: deviceId,
    imei: cleanImei,
    serialNumber: (serialNumber || '').trim(),
    batchId: batchId || 'عام',
    model: model || 'تابلت مدرسي معتمد',
    status: 'inventory', // inventory | delivered | maintenance
    assignedStudentCode: null,
    assignedStudentName: null,
    deliveredDate: null,
    deliveredBy: null,
    schoolId,
    registeredAt: new Date().toISOString(),
    history: [
      {
        action: 'حصر في المخزن المدرسي',
        timestamp: new Date().toISOString(),
        details: 'تم فحص وقيد الجهاز برقم IMEI الفعلي',
      },
    ],
  };

  try {
    const deviceRef = doc(db, 'schools', schoolId, 'devices', deviceId);
    await setDoc(deviceRef, {
      ...deviceData,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Firestore registerTabletDevice notice:', err);
  }

  // Update local cache
  const updatedDevices = [deviceData, ...devices.filter((d) => d.imei !== cleanImei)];
  localStorage.setItem(`${CACHE_DEVICES_KEY}${schoolId}`, JSON.stringify(updatedDevices));

  await recordAuditEvent({
    action: 'تسجيل جهاز تابلت جديد بالمخزن',
    target: `IMEI: ${cleanImei}`,
    details: `الرقم التسلسلي: ${deviceData.serialNumber || 'غير محدد'}`,
    operatorRole: 'tech_specialist',
    schoolId,
  });

  return deviceData;
}

export async function deliverTabletDevice(imei, { studentCode, studentName, operatorName }, schoolId = DEFAULT_SCHOOL_ID) {
  const cleanImei = String(imei).trim();
  const devices = await getTabletDevices(schoolId);
  const device = devices.find((d) => d.imei === cleanImei);

  if (!device) {
    throw new Error('الجهاز غير مسجل في قاعدة بيانات المدرسة.');
  }

  if (device.status === 'delivered') {
    throw new Error(`الجهاز تم تسليمه رسمياً بالفعل للطالب (${device.assignedStudentName || device.assignedStudentCode}).`);
  }

  const updatedHistory = [
    ...(device.history || []),
    {
      action: 'تسليم رسمي ومحضر استلام',
      timestamp: new Date().toISOString(),
      details: `تم التسليم للطالب: ${studentName} (كود: ${studentCode}) بموجب إقرار الاستلام والتابلت سليم`,
    },
  ];

  const updatedDevice = {
    ...device,
    status: 'delivered',
    assignedStudentCode: studentCode,
    assignedStudentName: studentName,
    deliveredDate: new Date().toISOString().split('T')[0],
    deliveredBy: operatorName || 'مسؤول التطوير التكنولوجي',
    history: updatedHistory,
  };

  try {
    const deviceRef = doc(db, 'schools', schoolId, 'devices', device.id || `dev_${cleanImei}`);
    await updateDoc(deviceRef, {
      status: 'delivered',
      assignedStudentCode: studentCode,
      assignedStudentName: studentName,
      deliveredDate: updatedDevice.deliveredDate,
      deliveredBy: updatedDevice.deliveredBy,
      history: updatedHistory,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Firestore deliverTabletDevice notice:', err);
  }

  // Update local cache
  const updatedList = devices.map((d) => (d.imei === cleanImei ? updatedDevice : d));
  localStorage.setItem(`${CACHE_DEVICES_KEY}${schoolId}`, JSON.stringify(updatedList));

  await recordAuditEvent({
    action: 'تسليم تابلت رسمي لطالب',
    target: `IMEI: ${cleanImei}`,
    details: `المستلم: ${studentName} (كود: ${studentCode})`,
    operatorRole: 'tech_specialist',
    schoolId,
  });

  return updatedDevice;
}
