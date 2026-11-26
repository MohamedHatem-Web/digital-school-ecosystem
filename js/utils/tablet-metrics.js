export function summarizeTabletDevices(devices) {
  return devices.reduce((counts, device) => {
    counts.total += 1;
    switch (device.status) {
      case 'inventory':
        counts.inventory += 1;
        break;
      case 'delivered':
        counts.delivered += 1;
        break;
      case 'maintenance':
        counts.maintenance += 1;
        break;
      default:
        counts.unclassified += 1;
    }
    return counts;
  }, {
    total: 0,
    inventory: 0,
    delivered: 0,
    maintenance: 0,
    unclassified: 0,
  });
}

export function countPreviousDeliveredTablets(devices, studentCode, excludedImei = '') {
  const code = String(studentCode || '').trim();
  if (!code) return 0;
  return devices.filter((device) =>
    device.status === 'delivered' &&
    String(device.assignedStudentCode || '').trim() === code &&
    device.imei !== excludedImei
  ).length;
}
