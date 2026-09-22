import chalk from 'chalk';
import stringWidth from 'string-width';

const W = 66; // Chiều rộng chuẩn của card

// Chuyển mã hex thành [r, g, b]
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Tạo gradient màu mượt mà qua một mảng các màu hex
 */
export function multiGradient(text, colors = ['#8B5CF6', '#3B82F6', '#06B6D4']) {
  const chars = [...text];
  const len = chars.length || 1;
  const rgbColors = colors.map(hexToRgb);

  return chars.map((c, i) => {
    const t = (i / (len - 1 || 1)) * (rgbColors.length - 1);
    const idx = Math.min(Math.floor(t), rgbColors.length - 2);
    const localT = t - idx;
    const [r1, g1, b1] = rgbColors[idx];
    const [r2, g2, b2] = rgbColors[idx + 1];
    const r = Math.round(r1 + (r2 - r1) * localT);
    const g = Math.round(g1 + (g2 - g1) * localT);
    const b = Math.round(b1 + (b2 - b1) * localT);
    return chalk.rgb(r, g, b)(c);
  }).join('');
}

/**
 * Căn lề chuẩn xác dựa trên chiều rộng hiển thị thực tế (hỗ trợ Emoji và Unicode)
 */
function pad(str, len) {
  const vLen = stringWidth(str);
  if (vLen >= len) return str;
  return str + ' '.repeat(len - vLen);
}

/**
 * Cắt ngắn chuỗi nếu quá dài theo chiều rộng terminal thực tế
 */
function truncateVisual(str, maxLen) {
  if (stringWidth(str) <= maxLen) return str;
  let res = '';
  for (const ch of str) {
    if (stringWidth(res + ch + '…') > maxLen) {
      return res + '…';
    }
    res += ch;
  }
  return res + '…';
}

function boxTop(title = '', borderColor = chalk.hex('#3B82F6')) {
  if (!title) {
    return borderColor('╭' + '─'.repeat(W - 2) + '╮');
  }
  const titleWidth = stringWidth(title);
  const leftDash = '─'.repeat(3);
  const rightDashLen = Math.max(0, W - 2 - 3 - titleWidth);
  return borderColor('╭' + leftDash) + title + borderColor('─'.repeat(rightDashLen) + '╮');
}

function boxBottom(borderColor = chalk.hex('#3B82F6')) {
  return borderColor('╰' + '─'.repeat(W - 2) + '╯');
}

function boxDivider(borderColor = chalk.hex('#3B82F6')) {
  return borderColor('├' + '─'.repeat(W - 2) + '┤');
}

function boxRow(content = '', borderColor = chalk.hex('#3B82F6')) {
  return borderColor('│ ') + pad(content, W - 4) + borderColor(' │');
}

/**
 * Banner thương hiệu cao cấp dạng ASCII Art + Gradient
 */
export function printBanner(version = '1.0.0') {
  const ascii = [
    '   ____ _ _     ____            _       _____ _                 ',
    '  / ___(_) |_  |  _ \\ _   _ ___| |__   |_   _(_)_ __ ___   ___  ',
    ' | |  _| | __| | |_) | | | / __| \'_ \\    | | | | \'_ ` _ \\ / _ \\ ',
    ' | |_| | | |_  |  __/| |_| \\__ \\ | | |   | | | | | | | | |  __/ ',
    '  \\____|_|\\__| |_|    \\__,_|___/_| |_|   |_| |_|_| |_| |_|\\___| '
  ];

  console.log('');
  const colors = ['#A855F7', '#6366F1', '#38BDF8', '#34D399'];
  ascii.forEach((l) => console.log(multiGradient(l, colors)));

  const badgeVer = chalk.bgHex('#1E293B').hex('#38BDF8').bold(` 🚀 v${version} `);
  const badgeSpeed = chalk.bgHex('#1E293B').hex('#A78BFA').bold(' ⚡ Siêu Tốc ');
  const badgeShield = chalk.bgHex('#1E293B').hex('#34D399').bold(' 🛡️ Secret Shield ');
  const badgeDate = chalk.bgHex('#1E293B').hex('#FBBF24').bold(' ⏰ Backdate Commit ');

  console.log(`\n  ${badgeVer} ${badgeSpeed} ${badgeShield} ${badgeDate}\n`);
}

/**
 * Tiêu đề phân đoạn với styling thanh lịch
 */
export function printSection(title) {
  const icon = chalk.hex('#38BDF8')('✦');
  const titleStyled = chalk.bold.hex('#F1F5F9')(` ${title} `);
  const prefix = chalk.hex('#475569')('─── ') + icon + titleStyled;
  const remaining = Math.max(0, W - stringWidth(prefix));
  console.log('');
  console.log(prefix + chalk.hex('#475569')('─'.repeat(remaining)));
}

/**
 * Nhãn bước tiến trình dạng pill badge: [ 1/6 ] Khởi tạo Git repo...
 */
export function stepLabel(current, total, text) {
  const pill = chalk.bgHex('#3B82F6').hex('#FFFFFF').bold(` ${current}/${total} `);
  return `${pill} ` + chalk.hex('#E2E8F0')(text);
}

/**
 * Bảng tóm tắt thông tin triển khai trước khi push (Card bo góc sắc nét)
 */
export function printSummary({ repoUrl, commitMsg, dateDisplay, branch, force }) {
  const shortRepo = truncateVisual(repoUrl, 44);
  const shortMsg = truncateVisual(commitMsg, 44);
  const border = chalk.hex('#6366F1');

  const title = chalk.bold.hex('#F8FAFC')(' 📋 THÔNG TIN ĐẨY DỰ ÁN ');
  console.log('');
  console.log(boxTop(title, border));
  console.log(boxRow(chalk.hex('#94A3B8')('🔗 Repository  ') + chalk.hex('#38BDF8').underline(shortRepo), border));
  console.log(boxRow(chalk.hex('#94A3B8')('💬 Message     ') + chalk.hex('#FBBF24').bold(shortMsg), border));
  console.log(boxRow(chalk.hex('#94A3B8')('📅 Thời gian   ') + chalk.hex('#C084FC')(dateDisplay), border));
  console.log(boxRow(chalk.hex('#94A3B8')('🌿 Branch      ') + chalk.bgHex('#0F766E').hex('#5EEAD4').bold(` ${branch} `), border));

  const forceText = force
    ? chalk.bgHex('#991B1B').hex('#FCA5A5').bold(' BẬT (--force) ⚠️ ')
    : chalk.hex('#64748B')('Tắt (an toàn)');
  console.log(boxRow(chalk.hex('#94A3B8')('⚡ Force Push  ') + forceText, border));
  console.log(boxBottom(border));
}

/**
 * Card cảnh báo file / nội dung secret trước khi commit (Theme Amber / Gold)
 */
export function printPrePushSecretWarning({ riskyFiles = [], findings = [] }) {
  const border = chalk.hex('#F59E0B');
  const title = chalk.bold.hex('#FEF08A')(' ⚠️  CẢNH BÁO: PHÁT HIỆN DỮ LIỆU NHẠY CẢM ');

  console.log('');
  console.log(boxTop(title, border));
  console.log(boxRow(chalk.hex('#FDE047')('GitHub có thể chặn push nếu phát hiện key bí mật (GH013)'), border));
  console.log(boxRow('', border));

  if (riskyFiles.length > 0) {
    console.log(boxRow(chalk.bold.hex('#F8FAFC')('📁 File cấu hình nhạy cảm:'), border));
    riskyFiles.slice(0, 5).forEach((f, idx) => {
      const isLast = idx === riskyFiles.slice(0, 5).length - 1;
      const tree = chalk.hex('#64748B')(isLast ? '   └─ ' : '   ├─ ');
      console.log(boxRow(tree + chalk.hex('#FCD34D')(truncateVisual(f, 48)), border));
    });
    if (riskyFiles.length > 5) {
      console.log(boxRow(chalk.hex('#94A3B8')(`   └─ …và ${riskyFiles.length - 5} file khác`), border));
    }
  }

  if (findings.length > 0) {
    if (riskyFiles.length > 0) console.log(boxRow('', border));
    console.log(boxRow(chalk.bold.hex('#F8FAFC')('🔑 Vị trí nghi vấn secret:'), border));
    findings.slice(0, 5).forEach((f, idx) => {
      const isLast = idx === findings.slice(0, 5).length - 1;
      const tree = chalk.hex('#64748B')(isLast ? '   └─ ' : '   ├─ ');
      const loc = truncateVisual(`${f.file}:${f.line}`, 28);
      console.log(boxRow(tree + chalk.hex('#F8FAFC')(loc) + chalk.hex('#94A3B8')(` [${f.type}]`), border));
      if (f.preview) {
        const indent = chalk.hex('#64748B')(isLast ? '      ' : '   │  ');
        console.log(boxRow(indent + chalk.hex('#64748B')(`"${truncateVisual(f.preview, 44)}"`), border));
      }
    });
    if (findings.length > 5) {
      console.log(boxRow(chalk.hex('#94A3B8')(`   └─ …và ${findings.length - 5} vị trí khác`), border));
    }
  }

  console.log(boxRow('', border));
  console.log(boxRow(chalk.hex('#A7F3D0')(truncateVisual('💡 Khuyên dùng: Chọn "Tự động fix" để gỡ file + .gitignore', W - 4)), border));
  console.log(boxBottom(border));
}

/**
 * Card cảnh báo khi push bị GitHub Push Protection chặn (Theme Crimson / Ruby)
 */
export function printSecretBlockedBox(rawMessage, details = {}) {
  const border = chalk.hex('#EF4444');
  const files = details.files || [];
  const types = details.secretTypes || [];
  const title = chalk.bold.hex('#FEE2E2')(' 🚫  PUSH BỊ CHẶN — PHÁT HIỆN SECRET (GH013) ');

  console.log('');
  console.log(boxTop(title, border));
  console.log(boxRow(chalk.hex('#FCA5A5')('GitHub Push Protection đã chặn push vì phát hiện secret!'), border));
  console.log(boxRow('', border));

  if (types.length > 0) {
    console.log(boxRow(chalk.hex('#94A3B8')('🔑 Loại secret : ') + chalk.hex('#F8FAFC').bold(types.slice(0, 2).join(', ')), border));
  }
  if (files.length > 0) {
    files.slice(0, 3).forEach((f) => {
      console.log(boxRow(chalk.hex('#94A3B8')('📁 File nguồn  : ') + chalk.hex('#FCD34D')(truncateVisual(f, 44)), border));
    });
  }

  console.log(boxRow('', border));
  console.log(boxRow(chalk.bold.hex('#F8FAFC')('👉 Các giải pháp khắc phục:'), border));
  console.log(boxRow(chalk.hex('#F8FAFC')('  ① Thu hồi (revoke) key ngay nếu là token thật'), border));
  console.log(boxRow(chalk.hex('#38BDF8')('  ② Chạy: git-push-time fix để tự động gỡ & squash commit'), border));
  console.log(boxRow(chalk.hex('#94A3B8')('  ③ Xóa secret trong code / dùng biến môi trường (process.env)'), border));
  console.log(boxRow(chalk.hex('#94A3B8')('  ④ Sau đó chạy lại tool để đẩy code lên'), border));

  console.log(boxBottom(border));

  if (details.unblockUrl) {
    console.log(chalk.hex('#F59E0B')(`\n  🔓 URL mở khóa tạm thời (nếu là key mẫu thử nghiệm):\n  ${chalk.underline(details.unblockUrl)}`));
  }
  console.log(chalk.hex('#64748B')(`\n  📖 Tài liệu GitHub: ${details.resolveUrl || 'https://docs.github.com/code-security/secret-scanning/pushing-a-branch-blocked-by-push-protection'}\n`));
}

/**
 * Card thông báo thành công rực rỡ (Theme Emerald / Mint Green)
 */
export function printSuccessBox({ branch, repoUrl }) {
  const border = chalk.hex('#10B981');
  const title = chalk.bold.hex('#ECFDF5')(' 🎉  ĐẨY DỰ ÁN LÊN GIT THÀNH CÔNG! ');

  console.log('');
  console.log(boxTop(title, border));
  console.log(boxRow('', border));
  console.log(boxRow(chalk.hex('#94A3B8')('🌿 Branch  : ') + chalk.bgHex('#065F46').hex('#6EE7B7').bold(` ${branch} `), border));
  console.log(boxRow(chalk.hex('#94A3B8')('🔗 Remote  : ') + chalk.hex('#38BDF8').underline(truncateVisual(repoUrl, 44)), border));
  console.log(boxRow(chalk.hex('#94A3B8')('✨ Kết quả : ') + chalk.hex('#A7F3D0')('Mọi thay đổi đã được đồng bộ lên Git!'), border));
  console.log(boxRow('', border));
  console.log(boxRow(chalk.hex('#64748B')('💡 Kiểm tra lịch sử commit: git log -1 --stat'), border));
  console.log(boxBottom(border));
  console.log('');
}

/**
 * Thông báo hủy thao tác
 */
export function printCancelled() {
  const border = chalk.hex('#F59E0B');
  const title = chalk.bold.hex('#FEF3C7')(' ✋  ĐÃ HỦY THAO TÁC ');
  console.log('');
  console.log(boxTop(title, border));
  console.log(boxRow(chalk.hex('#FDE68A')('Không có gì thay đổi trên kho lưu trữ.'), border));
  console.log(boxBottom(border));
  console.log('');
}

/**
 * Card lỗi chung (Theme Rose / Red) — dùng cho mọi lỗi validation, git, npm
 */
export function printErrorBox(title = 'XẢY RA LỖI', lines = [], hint = '') {
  const border = chalk.hex('#EF4444');
  const titleStyled = chalk.bold.hex('#FEE2E2')(` ❌  ${title} `);
  const rows = Array.isArray(lines) ? lines : [String(lines || '')];

  console.log('');
  console.log(boxTop(titleStyled, border));
  rows.forEach((l) => {
    if (!l) {
      console.log(boxRow('', border));
    } else {
      console.log(boxRow(chalk.hex('#FCA5A5')(truncateVisual(String(l), W - 4)), border));
    }
  });
  if (hint) {
    console.log(boxRow('', border));
    console.log(boxRow(chalk.hex('#38BDF8')(`👉 ${truncateVisual(hint, W - 8)}`), border));
  }
  console.log(boxBottom(border));
  console.log('');
}

/**
 * Lỗi chưa cài Git
 */
export function printGitMissing() {
  printErrorBox('CHƯA CÀI ĐẶT GIT', [
    'Chưa phát hiện Git trên máy. Hãy cài Git rồi chạy lại tool nhé!',
  ], 'https://git-scm.com/downloads');
}

/**
 * Lỗi xác thực Git (sai token / hết hạn / chưa login)
 */
export function printAuthFailedBox(message = '') {
  const border = chalk.hex('#EF4444');
  const title = chalk.bold.hex('#FEE2E2')(' 🔒  LỖI XÁC THỰC GIT ');
  const firstLine = String(message || '').split('\n')[0].slice(0, 120);

  console.log('');
  console.log(boxTop(title, border));
  console.log(boxRow(chalk.hex('#FCA5A5')('Không thể xác thực với remote. Kiểm tra lại quyền truy cập.'), border));
  if (firstLine) console.log(boxRow(chalk.hex('#64748B')(truncateVisual(firstLine, W - 4)), border));
  console.log(boxRow('', border));
  console.log(boxRow(chalk.bold.hex('#F8FAFC')('👉 Cách khắc phục nhanh:'), border));
  console.log(boxRow(chalk.hex('#F8FAFC')('  ① gh auth login  (nếu dùng GitHub CLI)'), border));
  console.log(boxRow(chalk.hex('#F8FAFC')('  ② Tạo Personal Access Token mới rồi push lại'), border));
  console.log(boxRow(chalk.hex('#94A3B8')('  ③ Dùng SSH: git@github.com:user/repo.git'), border));
  console.log(boxBottom(border));
  console.log('');
}

/**
 * Lỗi remote có commit mới hơn local (non-fast-forward)
 */
export function printNonFastForwardBox(message = '', branch = 'main') {
  const border = chalk.hex('#F59E0B');
  const title = chalk.bold.hex('#FEF3C7')(' ⚠️  REMOTE ĐÃ CÓ COMMIT MỚI HƠN ');
  const firstLine = String(message || '').split('\n')[0].slice(0, 120);

  console.log('');
  console.log(boxTop(title, border));
  console.log(boxRow(chalk.hex('#FDE68A')('Local của bạn đang tụt hậu so với remote.'), border));
  if (firstLine) console.log(boxRow(chalk.hex('#64748B')(truncateVisual(firstLine, W - 4)), border));
  console.log(boxRow('', border));
  console.log(boxRow(chalk.hex('#38BDF8')(`  → Chạy: git pull --rebase origin ${branch} rồi push lại`), border));
  console.log(boxRow(chalk.hex('#94A3B8')('    Chỉ dùng --force khi chắc chắn muốn ghi đè.'), border));
  console.log(boxBottom(border));
  console.log('');
}

/**
 * Kết quả auto-fix secret (dùng chung cho flow push + lệnh fix)
 */
export function printFixResult({ fixed = [], gitignoreAdded = [], codeFilesWithSecrets = [], failed = [] } = {}) {
  if (fixed.length > 0) {
    console.log(chalk.hex('#34D399')(`  ✓ Đã gỡ ${fixed.length} file khỏi commit: ${truncateVisual(fixed.join(', '), 46)}`));
  }
  if (gitignoreAdded.length > 0) {
    console.log(chalk.cyan(`  + .gitignore: ${truncateVisual(gitignoreAdded.join(', '), 48)}`));
  }
  if (codeFilesWithSecrets && codeFilesWithSecrets.length > 0) {
    console.log(chalk.yellowBright('  ⚠️  File mã nguồn chứa secret trong code (đã gỡ khỏi commit, KHÔNG đưa vào .gitignore):'));
    codeFilesWithSecrets.forEach((f) => console.log(chalk.yellow(`     • ${f}`)));
    console.log(chalk.gray('     👉 Mở file để xóa key, thay bằng biến môi trường (process.env).'));
  }
  if (failed.length > 0) {
    failed.forEach((f) => console.log(chalk.red(`  ✗ ${f.file}: ${f.reason}`)));
  }
}

/**
 * Card npm publish (Theme Violet)
 */
export function printNpmResult({ ok, pkgName, version, output = '', hint = '', dryRun = false }) {
  if (ok) {
    const border = chalk.hex('#8B5CF6');
    const title = chalk.bold.hex('#EDE9FE')(dryRun ? ' 🧪  DRY-RUN OK — SẴN SÀNG PUBLISH ' : ' 📦  PUBLISH NPM THÀNH CÔNG! ');
    console.log('');
    console.log(boxTop(title, border));
    console.log(boxRow(chalk.hex('#94A3B8')('📦 Package : ') + chalk.hex('#F8FAFC').bold(`${pkgName}@${version}`), border));
    if (!dryRun) {
      console.log(boxRow(chalk.hex('#94A3B8')('🔗 Xem tại  : ') + chalk.hex('#38BDF8').underline(`npmjs.com/package/${pkgName}`), border));
    } else {
      console.log(boxRow(chalk.hex('#94A3B8')('✨ Kết quả : ') + chalk.hex('#A7F3D0')('Không lỗi — chạy thật để publish.'), border));
    }
    console.log(boxBottom(border));
    console.log('');
    return;
  }
  printErrorBox('PUBLISH NPM THẤT BẠI', output.split('\n').slice(-6).filter(Boolean), hint);
}

/**
 * Footer nhỏ sau mỗi lần chạy thành công / kết thúc
 */
export function printFooter() {
  console.log(chalk.hex('#475569')('  ── ✦ ──'));
  console.log(chalk.hex('#64748B')('  💡 Mẹo: dùng ') + chalk.hex('#38BDF8')('git-push-time -y --fix --publish') + chalk.hex('#64748B')(' để auto 100% cho lần sau.'));
  console.log(chalk.hex('#334155')('  📖 Docs: https://github.com — Issues: tạo issue nếu gặp lỗi push.\n'));
}

/**
 * Style cho --help của commander cho đồng bộ theme
 */
export function styleCliHelp(program) {
  program.configureHelp({
    styleTitle: (t) => chalk.bold.hex('#38BDF8')(t),
    styleCommandText: (t) => chalk.hex('#F8FAFC')(t),
    styleOptionText: (t) => chalk.hex('#5EEAD4')(t),
    styleArgumentText: (t) => chalk.hex('#FBBF24')(t),
    styleDescriptionText: (t) => chalk.hex('#94A3B8')(t),
  });
  program.addHelpText('after', `
${chalk.hex('#475569')('─── ✦ Ví dụ nhanh ───')}
  ${chalk.hex('#34D399')('$')} ${chalk.white('git-push-time -r https://github.com/user/repo.git -m "Init" -d "-2d" -y')}
  ${chalk.hex('#34D399')('$')} ${chalk.white('git-push-time fix')}
  ${chalk.hex('#34D399')('$')} ${chalk.white('git-push-time -r <url> --publish --dry-run')}
`);
}

export function line(char = '─') {
  return chalk.hex('#334155')(char.repeat(W));
}
