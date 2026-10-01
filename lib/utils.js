import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(customParseFormat);

/**
 * Kiểm tra xem URL git có hợp lệ hay không (HTTP/HTTPS, SSH, hoặc `.git`)
 * @param {string} url 
 * @returns {boolean}
 */
export function isValidGitUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  // Standard git remote URL patterns: https://, http://, git@, ssh://, or file path
  const gitRegex = /^(https?:\/\/|git@|ssh:\/\/|ftps?:\/\/).+$/i;
  return gitRegex.test(trimmed) || trimmed.endsWith('.git');
}

/**
 * Parse chuỗi thời gian thành định dạng ISO/Git hợp lệ.
 * Hỗ trợ các định dạng:
 * - "now" hoặc để trống -> Thời gian hiện tại
 * - Relative (phân biệt hoa/thường cho đơn vị 1 ký tự):
 *   s=second, m=minute, h=hour, d=day, w=week, M=month, y=year
 *   VD: "-2d", "-5h", "-30m" (phút), "-1w", "-3M"/"-3mo"/"-3month" (tháng), "-1y"
 * - Absolute: "YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD HH:mm", "YYYY-MM-DD"
 *
 * @param {string} dateStr
 * @returns {{ valid: boolean, formatted: string, display: string, error?: string }}
 */
export function parseCustomDate(dateStr) {
  if (!dateStr || dateStr.trim().toLowerCase() === 'now') {
    const now = dayjs();
    return {
      valid: true,
      formatted: now.toISOString(),
      display: now.format('YYYY-MM-DD HH:mm:ss Z')
    };
  }

  const str = dateStr.trim();

  // Kiểm tra relative time: ví dụ -2d, -5h, -30m, -1w, -3M/-3mo, -1y hoặc 2d, 5h
  // Lưu ý: đơn vị 1 ký tự phân biệt hoa/thường (m = minute, M = month).
  const relativeMatch = str.match(/^([+-]?\d+)\s*(\S+)$/);
  if (relativeMatch) {
    let amount = parseInt(relativeMatch[1], 10);
    const unitRaw = relativeMatch[2];
    const unitLower = unitRaw.toLowerCase();

    // Map unit: ưu tiên so khớp từ dài trước, đơn vị 1 ký tự giữ case-sensitive
    let unit = null;
    if (['sec', 'secs', 'second', 'seconds'].includes(unitLower)) unit = 'second';
    else if (['min', 'mins', 'minute', 'minutes'].includes(unitLower)) unit = 'minute';
    else if (['hour', 'hours'].includes(unitLower)) unit = 'hour';
    else if (['day', 'days'].includes(unitLower)) unit = 'day';
    else if (['week', 'weeks'].includes(unitLower)) unit = 'week';
    else if (['mo', 'mos', 'month', 'months'].includes(unitLower)) unit = 'month';
    else if (['year', 'years'].includes(unitLower)) unit = 'year';
    else if (unitRaw === 's') unit = 'second';
    else if (unitRaw === 'm') unit = 'minute';
    else if (unitRaw === 'h') unit = 'hour';
    else if (unitRaw === 'd') unit = 'day';
    else if (unitRaw === 'w') unit = 'week';
    else if (unitRaw === 'M') unit = 'month';
    else if (unitRaw === 'y' || unitRaw === 'Y') unit = 'year';

    if (unit) {
      // Nếu người dùng nhập "2d" mà không có dấu "-", mặc định hiểu là "lùi 2d" (-2d)
      if (amount > 0 && !str.startsWith('+')) {
        amount = -amount;
      }

      const calculated = dayjs().add(amount, unit);
      if (!calculated.isValid()) {
        return { valid: false, formatted: '', display: '', error: `Không thể tính toán thời gian từ '${dateStr}'` };
      }

      return {
        valid: true,
        formatted: calculated.toISOString(),
        display: calculated.format('YYYY-MM-DD HH:mm:ss Z')
      };
    }
    // Rơi xuống parse absolute nếu unit không khớp (vd user gõ nhầm sẽ báo lỗi ở dưới)
  }

  // Thủ định dạng ngày giờ tuyệt đối
  const formats = [
    'YYYY-MM-DD HH:mm:ss',
    'YYYY-MM-DD HH:mm',
    'YYYY-MM-DD',
    'YYYY/MM/DD HH:mm:ss',
    'YYYY/MM/DD HH:mm',
    'YYYY/MM/DD',
    'DD/MM/YYYY HH:mm:ss',
    'DD/MM/YYYY HH:mm',
    'DD/MM/YYYY'
  ];

  let parsed = dayjs(str, formats, true);
  if (!parsed.isValid()) {
    parsed = dayjs(str); // Thử parse chuẩn ISO
  }

  if (parsed.isValid()) {
    return {
      valid: true,
      formatted: parsed.toISOString(),
      display: parsed.format('YYYY-MM-DD HH:mm:ss Z')
    };
  }

  return {
    valid: false,
    formatted: '',
    display: '',
    error: `Định dạng ngày giờ không hợp lệ: '${dateStr}'. Ví dụ đúng: "2024-01-15 14:30:00", "-2d", "-5h", "now"`
  };
}
