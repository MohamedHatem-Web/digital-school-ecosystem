// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Multi-School Tablet & IMEI Management Service (Cloud Firestore)
// ==========================================================================

import {
  db,
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  serverTimestamp,
} from '../firebase.js';
import { DEFAULT_SCHOOL_ID } from './school-service.js';
import { recordAuditEvent } from './audit-service.js';
import { getCurrentUser } from '../auth.js';

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
    const list = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    localStorage.setItem(`${CACHE_BATCHES_KEY}${schoolId}`, JSON.stringify(list));
    return list;
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

  return [];
}

export const registerTabletBatch = createTabletBatch;

export async function increaseTabletBatchQuantity(batchId, quantity, notes = '', schoolId = DEFAULT_SCHOOL_ID) {
  const additionalQuantity = Number(quantity);
  if (!batchId) throw new Error('اختر الدفعة التي تريد زيادة كميتها.');
  if (!Number.isInteger(additionalQuantity) || additionalQuantity < 1) {
    throw new Error('أدخل كمية صحيحة أكبر من صفر.');
  }

  const batches = await getTabletBatches(schoolId);
  const batch = batches.find((entry) => entry.id === batchId);
  if (!batch) throw new Error('الدفعة غير موجودة. حدّث الصفحة ثم حاول مرة أخرى.');

  const updatedBatch = {
    ...batch,
    receivedQuantity: Number(batch.receivedQuantity || 0) + additionalQuantity,
    notes: notes.trim() || batch.notes || '',
    updatedAt: new Date().toISOString(),
  };

  const batchRef = doc(db, 'schools', schoolId, 'batches', batchId);
  await updateDoc(batchRef, {
    receivedQuantity: updatedBatch.receivedQuantity,
    notes: updatedBatch.notes,
    updatedAt: serverTimestamp(),
  });

  localStorage.setItem(
    `${CACHE_BATCHES_KEY}${schoolId}`,
    JSON.stringify(batches.map((entry) => entry.id === batchId ? updatedBatch : entry))
  );

  await recordAuditEvent({
    action: 'زيادة كمية دفعة تابلت',
    target: `دفعة ${batch.batchNumber || batchId}`,
    details: `إضافة ${additionalQuantity} جهاز. الإجمالي الجديد: ${updatedBatch.receivedQuantity}`,
    operatorRole: 'tech_specialist',
    schoolId,
  });

  return updatedBatch;
}

export async function createTabletBatch({ batchNumber, academicYear, receivedQuantity, deviceCount, deliveryDate, notes, operatorName }, schoolId = DEFAULT_SCHOOL_ID) {
  const cleanNumber = String(batchNumber).trim();
  if (!cleanNumber) {
    throw new Error('يرجى تحديد رقم أو إشارة دفعة الاستلام الوزارية.');
  }
  const quantity = Number(receivedQuantity ?? deviceCount);
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error('أدخل كمية مستلمة صحيحة أكبر من صفر.');
  }

  const batchId = `batch_${Date.now()}`;
  const batchData = {
    id: batchId,
    batchNumber: cleanNumber,
    academicYear: academicYear || '2026/2027',
    receivedQuantity: quantity,
    registeredCount: 0,
    activatedCount: 0,
    deliveredCount: 0,
    notes: notes || '',
    receivedDate: deliveryDate || new Date().toISOString().split('T')[0],
    operatorName: operatorName || 'مسؤول التطوير التكنولوجي',
    schoolId,
  };

  const batchRef = doc(db, 'schools', schoolId, 'batches', batchId);
  await setDoc(batchRef, {
    ...batchData,
    createdAt: serverTimestamp(),
  });

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

export async function getTabletDevicesForStudent(studentCode, schoolId = DEFAULT_SCHOOL_ID) {
  const cleanCode = String(studentCode || '').trim();
  if (!/^\d{6,12}$/.test(cleanCode)) return [];

  const devicesQuery = query(
    collection(db, 'schools', schoolId, 'devices'),
    where('assignedStudentCode', '==', cleanCode),
  );
  const snapshot = await getDocs(devicesQuery);
  return snapshot.docs.map((deviceDoc) => ({ id: deviceDoc.id, ...deviceDoc.data() }));
}

export async function getTabletDevices(schoolId = DEFAULT_SCHOOL_ID) {
  const currentUser = getCurrentUser();
  if (currentUser?.role === 'teacher') {
    if (!currentUser.classId) return [];
    try {
      const roster = await getDocs(query(
        collection(db, 'schools', schoolId, 'students'),
        where('classId', '==', currentUser.classId)
      ));
      const codes = roster.docs.map((studentDoc) => String(studentDoc.data().code || '').trim()).filter(Boolean);
      const snapshots = await Promise.all(codes.map((code) => getDocs(query(
        collection(db, 'schools', schoolId, 'devices'),
        where('assignedStudentCode', '==', code)
      ))));
      return snapshots.flatMap((snapshot) => snapshot.docs.map((deviceDoc) => ({ id: deviceDoc.id, ...deviceDoc.data() })));
    } catch (error) {
      console.warn('Firestore getTeacherTabletDevices notice:', error);
      return [];
    }
  }
  if (currentUser?.role === 'student') {
    const studentCode = String(currentUser.studentCode || currentUser.email?.match(/^(\d+)@cairo7\.moe\.edu\.eg$/i)?.[1] || '').trim();
    if (!studentCode) return [];
    try {
      const studentDevicesQuery = query(
        collection(db, 'schools', schoolId, 'devices'),
        where('assignedStudentCode', '==', studentCode)
      );
      const snapshot = await getDocs(studentDevicesQuery);
      return snapshot.docs.map((deviceDoc) => ({ id: deviceDoc.id, ...deviceDoc.data() }));
    } catch (error) {
      console.warn('Firestore getStudentTablet notice:', error);
      return [];
    }
  }

  const cacheKey = `${CACHE_DEVICES_KEY}${schoolId}`;
  try {
    const snapshot = await getDocs(collection(db, 'schools', schoolId, 'devices'));
    const list = snapshot.docs.map((deviceDoc) => ({ id: deviceDoc.id, ...deviceDoc.data() }));
    localStorage.setItem(cacheKey, JSON.stringify(list));
    return list;
  } catch (error) {
    console.warn('Firestore getTabletDevices notice (cache fallback):', error);
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

export async function registerTabletDevice({ imei, serialNumber, batchId, model }, schoolId = DEFAULT_SCHOOL_ID) {
  const cleanImei = String(imei).trim();
  if (!/^\d{14,15}$/.test(cleanImei)) {
    throw new Error('رقم IMEI غير صحيح، يجب أن يتكون من 14 إلى 15 رقماً.');
  }
  if (!batchId) throw new Error('اختر دفعة التابلت قبل تسجيل الجهاز.');

  const devices = await getTabletDevices(schoolId);

  // Strict duplicate prevention across the school
  const exists = devices.some((d) => d.imei === cleanImei);
  if (exists) {
    throw new Error(`رقم IMEI (${cleanImei}) مسجل بالفعل مسبقاً في قاعدة بيانات المدرسة.`);
  }

  const batches = await getTabletBatches(schoolId);
  const batch = batches.find((entry) => entry.id === batchId);
  if (!batch) throw new Error('الدفعة المختارة غير موجودة. حدّث الصفحة ثم حاول مرة أخرى.');
  const batchDevices = devices.filter((device) => device.batchId === batchId);
  if (batchDevices.length >= Number(batch.receivedQuantity || 0)) {
    throw new Error('تم تسجيل كل الأجهزة المستلمة في هذه الدفعة. أضف كمية للدفعة أولاً.');
  }

  const deviceId = `dev_${cleanImei}`;
  const deviceData = {
    id: deviceId,
    imei: cleanImei,
    serialNumber: (serialNumber || '').trim(),
    batchId,
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

  const deviceRef = doc(db, 'schools', schoolId, 'devices', deviceId);
  await setDoc(deviceRef, {
    ...deviceData,
    createdAt: serverTimestamp(),
  });

  // Update local cache
  const updatedDevices = [deviceData, ...devices.filter((d) => d.imei !== cleanImei)];
  localStorage.setItem(`${CACHE_DEVICES_KEY}${schoolId}`, JSON.stringify(updatedDevices));

  await recordAuditEvent({
    action: 'تسجيل جهاز تابلت جديد بالمخزن',
    target: `IMEI: ${cleanImei}`,
    details: `الدفعة: ${batch.batchNumber} | الرقم التسلسلي: ${deviceData.serialNumber || 'غير محدد'}`,
    operatorRole: 'tech_specialist',
    schoolId,
  });

  return deviceData;
}

export async function deliverTabletDevice(imei, { studentCode, studentName, operatorName, recipientName = '', recipientNationalId = '', recipientPhone = '' } = {}, schoolId = DEFAULT_SCHOOL_ID) {
  const cleanImei = String(imei).trim();
  if (!cleanImei) {
    throw new Error('يرجى إدخال رقم IMEI للجهاز المراد تسليمه.');
  }

  const devices = await getTabletDevices(schoolId);
  const device = devices.find((d) => d.imei === cleanImei);

  if (!studentCode || !studentName) {
    throw new Error('يرجى اختيار الطالب وتأكيد بيانات ولي الأمر قبل اعتماد التسليم.');
  }

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
    deliveryRecipient: {
      name: String(recipientName).trim(),
      nationalId: String(recipientNationalId).trim(),
      phone: String(recipientPhone).trim(),
    },
    history: updatedHistory,
  };

  const deviceRef = doc(db, 'schools', schoolId, 'devices', device.id || `dev_${cleanImei}`);
  await updateDoc(deviceRef, {
    status: 'delivered',
    assignedStudentCode: studentCode,
    assignedStudentName: studentName,
    deliveredDate: updatedDevice.deliveredDate,
    deliveredBy: updatedDevice.deliveredBy,
    deliveryRecipient: updatedDevice.deliveryRecipient,
    history: updatedHistory,
    updatedAt: serverTimestamp(),
  });

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
