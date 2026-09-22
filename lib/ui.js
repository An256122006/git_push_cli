import chalk from 'chalk';

const W = 62; // chiều rộng box

function line(char = '─') {
  return chalk.gray(char.repeat(W));
}

function pad(str, len) {
  const plain = stripAnsi(str);
  if (plain.length >= len) return str.slice(0, len);
  return str + ' '.repeat(len - plain.length);
}

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return String(s).replace(/\u001b\[[0-9;]*m/g, '');
}

function boxTop(color = chalk.cyan) {
  return color('╭' + '─'.repeat(W - 2) + '╮');
}
function boxBottom(color = chalk.cyan) {
  return color('╰' + '─'.repeat(W - 2) + '╯');
}
function boxRow(content, color = chalk.cyan) {
  return color('│ ') + pad(content, W - 4) + color(' │');
}

/** Banner chính của tool */
export function printBanner(version = '1.0.0') {
  console.log('');
  console.log(boxTop(chalk.cyanBright));
  console.log(boxRow(chalk.bold.cyanBright('  🚀  GIT PUSH TIME  •  Backdate Commit Tool'), chalk.cyanBright));
  console.log(boxRow(chalk.gray(`       Đẩy dự án lên Git siêu tốc  •  v${version}`), chalk.cyanBright));
  console.log(boxBottom(chalk.cyanBright));
}

/** Bảng tóm tắt trước khi push */
export function printSummary({ repoUrl, commitMsg, dateDisplay, branch, force }) {
  const shortRepo = repoUrl.length > 40 ? '…' + repoUrl.slice(-39) : repoUrl;
  const shortMsg = commitMsg.length > 40 ? commitMsg.slice(0, 39) + '…' : commitMsg;
  console.log('');
  console.log(chalk.bold.blue('╭─ 📋  THÔNG TIN ĐẨY DỰ ÁN ' + '─'.repeat(W - 25) + '╮'));
  console.log(chalk.blue('│ ') + chalk.gray('🔗 Remote    ') + chalk.green(shortRepo) + chalk.blue(' '.repeat(Math.max(0, W - 16 - stripAnsi(shortRepo).length)) + '│'));
  console.log(chalk.blue('│ ') + chalk.gray('💬 Message   ') + chalk.yellow(shortMsg) + chalk.blue(' '.repeat(Math.max(0, W - 16 - stripAnsi(shortMsg).length)) + '│'));
  console.log(chalk.blue('│ ') + chalk.gray('📅 Thời gian ') + chalk.magenta(dateDisplay) + chalk.blue(' '.repeat(Math.max(0, W - 16 - stripAnsi(dateDisplay).length)) + '│'));
  console.log(chalk.blue('│ ') + chalk.gray('🌿 Branch    ') + chalk.cyan(branch) + chalk.blue(' '.repeat(Math.max(0, W - 16 - stripAnsi(branch).length)) + '│'));
  const forceTxt = force ? chalk.red('CÓ (--force) ⚠️') : chalk.gray('Không');
  console.log(chalk.blue('│ ') + chalk.gray('⚡ Force     ') + forceTxt + chalk.blue(' '.repeat(Math.max(0, W - 16 - stripAnsi(forceTxt).length)) + '│'));
  console.log(chalk.bold.blue('╰' + '─'.repeat(W - 2) + '╯'));
}

/** Tiêu đề từng bước chạy, vd [3/6] */
export function stepLabel(current, total, text) {
  return chalk.bold.white(`[${current}/${total}] `) + chalk.cyan(text);
}

export function printSection(title) {
  console.log('');
  console.log(chalk.bold.cyan(`── ${title} `) + chalk.gray('─'.repeat(Math.max(0, W - title.length - 5))));
}

/** Box cảnh báo secret trước khi commit */
export function printPrePushSecretWarning({ riskyFiles = [], findings = [] }) {
  console.log('');
  console.log(boxTop(chalk.yellowBright));
  console.log(boxRow(chalk.bold.yellowBright('  ⚠️  PHÁT HIỆN FILE / NỘI DUNG NHẠY CẢM'), chalk.yellowBright));
  console.log(boxRow(chalk.gray('  GitHub có thể chặn push (GH013 Push Protection)'), chalk.yellowBright));
  console.log(boxRow('', chalk.yellowBright));
  if (riskyFiles.length > 0) {
    console.log(boxRow(chalk.bold.white('  📁 File khả nghi theo tên:'), chalk.yellowBright));
    riskyFiles.slice(0, 6).forEach((f) => {
      console.log(boxRow(chalk.yellow(`    • ${f.length > 48 ? '…' + f.slice(-47) : f}`), chalk.yellowBright));
    });
  }
  if (findings.length > 0) {
    console.log(boxRow(chalk.bold.white('  🔑 Nội dung giống secret:'), chalk.yellowBright));
    findings.slice(0, 6).forEach((f) => {
      const where = `${f.file}:${f.line}`.length > 34 ? '…' + `${f.file}:${f.line}`.slice(-33) : `${f.file}:${f.line}`;
      console.log(boxRow(chalk.white(`    • ${where}`) + chalk.gray(` — ${f.type}`), chalk.yellowBright));
    });
    if (findings.length > 6) {
      console.log(boxRow(chalk.gray(`    …và ${findings.length - 6} vị trí khác`), chalk.yellowBright));
    }
  }
  console.log(boxRow('', chalk.yellowBright));
  console.log(boxRow(chalk.gray('  Gỡ file: git rm --cached <file>  •  thêm vào .gitignore'), chalk.yellowBright));
  console.log(boxBottom(chalk.yellowBright));
}

/** Box lỗi GH013 sau khi push thất bại */
export function printSecretBlockedBox(rawMessage, details = {}) {
  const files = details.files || [];
  const types = details.secretTypes || [];
  console.log('');
  console.log(boxTop(chalk.redBright));
  console.log(boxRow(chalk.bold.redBright('  🚫  PUSH BỊ CHẶN — PHÁT HIỆN SECRET (GH013)'), chalk.redBright));
  console.log(boxRow('', chalk.redBright));
  if (types.length > 0) {
    console.log(boxRow(chalk.white(`  🔑 Loại: ${types.slice(0, 2).join(', ').slice(0, 46)}`), chalk.redBright));
  }
  if (files.length > 0) {
    files.slice(0, 4).forEach((f) => {
      console.log(boxRow(chalk.yellow(`  📁 ${f.length > 50 ? '…' + f.slice(-49) : f}`), chalk.redBright));
    });
  }
  console.log(boxRow('', chalk.redBright));
  console.log(boxRow(chalk.bold.white('  👉 Xử lý đúng:'), chalk.redBright));
  console.log(boxRow(chalk.white('  1. Revoke key ngay nếu là key thật (npm/GitHub/AWS)'), chalk.redBright));
  console.log(boxRow(chalk.cyanBright('  2. Chạy: git-push-time fix để tự động gỡ và squash sạch commit'), chalk.redBright));
  console.log(boxRow(chalk.gray('  3. Xóa secret trong code / dùng biến môi trường (process.env)'), chalk.redBright));
  console.log(boxRow(chalk.gray('  4. Sau đó chạy lại tool để đẩy code lên'), chalk.redBright));
  console.log(boxBottom(chalk.redBright));
  console.log(chalk.gray('  Chi tiết lỗi gốc:'));
  console.log(chalk.dim('  ' + rawMessage.split('\n').slice(0, 6).join('\n  ')));
  console.log(chalk.gray(`\n  📖 ${details.resolveUrl || 'https://docs.github.com/code-security/secret-scanning/pushing-a-branch-blocked-by-push-protection'}`));
  if (details.unblockUrl) {
    console.log(chalk.yellow(`  🔓 Chỉ Allow nếu là key test:\n  ${details.unblockUrl}`));
  }
  console.log(chalk.red('  ⛔ Tool không tự bypass để tránh lộ secret thật.\n'));
}

/** Box thành công */
export function printSuccessBox({ branch, repoUrl }) {
  console.log('');
  console.log(boxTop(chalk.greenBright));
  console.log(boxRow(chalk.bold.greenBright('  🎉  ĐẨY DỰ ÁN THÀNH CÔNG!'), chalk.greenBright));
  console.log(boxRow(chalk.gray(`  🌿 Branch: ${branch}`), chalk.greenBright));
  console.log(boxRow(chalk.gray('  ✨ Kiểm tra commit log trên GitHub/GitLab nhé!'), chalk.greenBright));
  console.log(boxBottom(chalk.greenBright));
  console.log(chalk.dim(`  🔗 ${repoUrl}\n`));
}

export function printCancelled() {
  console.log(chalk.yellow('\n  ✋ Đã hủy thao tác. Không có gì thay đổi.\n'));
}

export { line };
