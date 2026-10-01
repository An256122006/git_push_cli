import chalk from 'chalk';
import {
  checkGitInstalled,
  isGitRepo,
  getCurrentBranch,
  getRecentCommits,
  rewriteCommitDate,
  resolveTargetDir
} from '../git.js';
import { parseCustomDate } from '../utils.js';
import { selectWithBack, inputWithBack, BACK } from '../prompt-helpers.js';
import {
  printSection,
  printTargetDir,
  printGitMissing,
  printErrorBox
} from '../ui.js';

export async function runEditCommitTimeCommand(options = {}) {
  const fromMenu = options.fromMenu === true;

  let targetDir = process.cwd();
  if (options.dir) {
    const r = resolveTargetDir(options.dir, process.cwd());
    if (!r.ok) {
      printErrorBox('THƯ MỤC KHÔNG HỢP LỆ', [r.error]);
      if (fromMenu) return;
      process.exit(1);
    }
    targetDir = r.fullPath;
  }

  if (!checkGitInstalled()) {
    printGitMissing();
    if (fromMenu) return;
    process.exit(1);
  }
  if (!isGitRepo(targetDir)) {
    printErrorBox('CHƯA PHẢI GIT REPOSITORY', [`Thư mục '${targetDir}' chưa phải là Git repository.`]);
    if (fromMenu) return;
    process.exit(1);
  }

  printSection('SỬA THỜI GIAN COMMIT (BACKDATE)');
  printTargetDir(targetDir);

  try {
    const commits = getRecentCommits(100, targetDir);
    if (commits.length === 0) {
      printErrorBox('CHƯA CÓ COMMIT', ['Repository chưa có commit nào.']);
      if (fromMenu) return;
      process.exit(1);
    }

    // Dùng loop thay vì đệ quy để tránh stack tăng khi Back nhiều lần
    let commit = null;
    let dateInput = null;
    while (true) {
      // Bước 1: Chọn commit
      if (!commit) {
        if (commits.length === 1) {
          commit = commits[0];
          console.log(chalk.hex('#94A3B8')(`  » Chỉ có 1 commit nên tự chọn: ${commit.shortHash} — ${commit.subject}\n`));
        } else {
          const picked = await selectWithBack({
            message: `Chọn commit cần đổi thời gian (${commits.length} commit gần nhất):`,
            pageSize: 12,
            choices: commits.map((item) => ({
              name: `${item.date}  ${item.shortHash}  ${item.subject}`,
              value: item,
              description: 'Sửa commit này sẽ viết lại nó và các commit phía sau'
            }))
          });
          if (picked === BACK) return;
          commit = picked;
        }
      }

      // Bước 2: Chọn kiểu thời gian
      const dateOption = await selectWithBack({
        message: 'Chọn thời gian mới:',
        choices: [
          { name: 'Ngay bây giờ', value: 'now', description: 'Dùng thời gian hiện tại' },
          { name: 'Nhập thời gian tương đối', value: 'relative', description: 'VD: -2d, -5h, -30m, -3M' },
          { name: 'Nhập ngày giờ cụ thể', value: 'custom', description: 'VD: 2024-01-15 14:30:00' }
        ]
      });
      if (dateOption === BACK) {
        commit = null; // quay về chọn commit lại
        continue;
      }

      dateInput = dateOption;
      if (dateOption === 'relative') {
        const val = await inputWithBack({
          message: 'Nhập thời gian (ví dụ: -2d, -5h, -30m, -3M):',
          default: '-1d',
          validate: (value) => {
            const parsed = parseCustomDate(value);
            return parsed.valid || parsed.error;
          }
        });
        if (val === BACK) continue; // về chọn kiểu thời gian
        dateInput = val;
      } else if (dateOption === 'custom') {
        const val = await inputWithBack({
          message: 'Nhập ngày giờ (YYYY-MM-DD HH:mm:ss):',
          validate: (value) => {
            const parsed = parseCustomDate(value);
            return parsed.valid || parsed.error;
          }
        });
        if (val === BACK) continue; // về chọn kiểu thời gian
        dateInput = val;
      }
      break;
    }

    const parsed = parseCustomDate(dateInput);
    if (!parsed.valid) {
      printErrorBox('THỜI GIAN KHÔNG HỢP LỆ', [parsed.error], 'VD: now, -2d, -5h, 2024-01-15 14:30:00');
      if (fromMenu) return;
      process.exit(1);
    }

    const currentBranch = getCurrentBranch(targetDir);
    const result = rewriteCommitDate(commit.hash, parsed.formatted, targetDir);

    printSection('ĐÃ ĐỔI THỜI GIAN COMMIT THÀNH CÔNG');
    console.log(`  Nhánh: ${chalk.hex('#38BDF8').bold(currentBranch)}`);
    console.log(`  Commit: ${chalk.hex('#FBBF24').bold(commit.shortHash)} — ${commit.subject}`);
    console.log(`  Thời gian mới: ${chalk.hex('#C084FC').bold(parsed.display)}`);
    console.log(`  Đã viết lại ${result.rewrittenCount} commit trên branch hiện tại.`);
    console.log(`  Nhánh backup an toàn: ${chalk.hex('#6EE7B7')(result.backupBranch)}`);
    console.log(chalk.hex('#FBBF24')('  [!] Nếu commit đã từng push, bạn cần dùng force push (--force) để cập nhật remote.\n'));
  } catch (error) {
    printErrorBox('KHÔNG THỂ ĐỔI THỜI GIAN', [error.message], 'Working tree phải sạch và commit phải nằm trên branch hiện tại.');
    if (fromMenu) return;
    process.exit(1);
  }
}
