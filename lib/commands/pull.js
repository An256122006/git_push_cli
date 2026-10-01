import chalk from 'chalk';
import { select } from '@inquirer/prompts';
import {
  checkGitInstalled,
  isGitRepo,
  getCurrentBranchStrict,
  pullFromRemote,
  resolveTargetDir
} from '../git.js';
import {
  printSection,
  printTargetDir,
  printGitMissing,
  printErrorBox,
  printFooter
} from '../ui.js';

export async function runPullCommand(remote = 'origin', branch, options = {}) {
  const fromMenu = options.fromMenu === true;

  if (!checkGitInstalled()) {
    printGitMissing();
    if (fromMenu) return;
    process.exit(1);
  }

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

  if (!isGitRepo(targetDir)) {
    printErrorBox('CHƯA PHẢI GIT REPOSITORY', [`Thư mục '${targetDir}' chưa phải Git repository.`]);
    if (fromMenu) return;
    process.exit(1);
  }

  if (!branch) {
    branch = getCurrentBranchStrict(targetDir);
  }

  if (!branch) {
    printErrorBox('KHÔNG XÁC ĐỊNH ĐƯỢC BRANCH', ['Đang ở detached HEAD nên không biết pull branch nào.'], 'Checkout về branch chính rồi chạy lại.');
    if (fromMenu) return;
    process.exit(1);
  }

  const isInteractive = !options.yes;
  try {
    printSection(`PULL --ff-only ${remote}/${branch}`);
    printTargetDir(targetDir);
    const result = pullFromRemote(remote, branch, targetDir);
    console.log(chalk.hex('#34D399')(`  [OK] ${result || 'Repository đã cập nhật mới nhất (fast-forward).'}\n`));
    if (!fromMenu) printFooter();
  } catch (error) {
    printErrorBox('PULL THẤT BẠI', [String(error.message).split('\n')[0]], 'Fast-forward thất bại khi lịch sử bị lệch. Có thể thử pull --rebase.');
    if (!isInteractive) {
      if (fromMenu) return;
      process.exit(1);
    }

    const choice = await select({
      message: 'Pull fast-forward thất bại. Bạn muốn làm gì tiếp?',
      choices: [
        { name: 'Thử kéo về bằng pull --rebase', value: 'rebase', description: `git pull --rebase ${remote} ${branch}` },
        { name: 'Quay lại', value: 'back', description: 'Về màn hình trước' },
        { name: 'x Thoát', value: 'exit', description: 'Không làm gì thêm' }
      ]
    });

    if (choice === 'rebase') {
      try {
        console.log(chalk.hex('#38BDF8')(`\n  » Đang chạy: git pull --rebase ${remote} ${branch}...`));
        const out = pullFromRemote(remote, branch, targetDir, { rebase: true });
        console.log(chalk.hex('#34D399')(`  [OK] Pull --rebase thành công! ${String(out).split('\n')[0].slice(0, 100)}\n`));
        if (!fromMenu) printFooter();
      } catch (rebaseErr) {
        printErrorBox('PULL --REBASE THẤT BẠI', [String(rebaseErr.message).split('\n')[0]], 'Có thể bị xung đột code (conflict). Mở git status để giải quyết.');
        if (!fromMenu) process.exit(1);
      }
    }
  }
}
