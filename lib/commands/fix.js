import chalk from 'chalk';
import ora from 'ora';
import {
  checkGitInstalled,
  isGitRepo,
  getCurrentBranchStrict,
  findRiskyStagedFiles,
  resolveTargetDir
} from '../git.js';
import { scanStagedContentForSecrets } from '../secrets.js';
import {
  autoFixStagedSecrets,
  findRiskyWorkingTreeFiles,
  getUnpushedCommits,
  squashUnpushedCommits
} from '../fix.js';
import { selectWithBack, BACK } from '../prompt-helpers.js';
import {
  printSection,
  printTargetDir,
  printGitMissing,
  printErrorBox,
  printPrePushSecretWarning,
  printFixResult
} from '../ui.js';

export async function runFixCommand(options = {}) {
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

  printSection('QUÉT & GỠ SECRET BẢO VỆ REPO');
  printTargetDir(targetDir);

  if (!isGitRepo(targetDir)) {
    printErrorBox('CHƯA PHẢI GIT REPOSITORY', [`Thư mục '${targetDir}' chưa phải là Git repository.`]);
    if (fromMenu) return;
    process.exit(1);
  }

  const spinner = ora({ text: 'Đang kiểm tra staged files và thư mục làm việc…', color: 'cyan' }).start();
  const risky = findRiskyStagedFiles(targetDir);
  const findings = scanStagedContentForSecrets(targetDir);
  const riskyWorking = findRiskyWorkingTreeFiles(targetDir);
  spinner.stop();

  const allDetected = [...new Set([...risky, ...findings.map((f) => f.file), ...riskyWorking])];
  const hadSecrets = allDetected.length > 0;

  if (allDetected.length === 0) {
    console.log(chalk.hex('#34D399')('  [OK] Không phát hiện file secret mới ở stage hay thư mục làm việc!\n'));
  } else {
    printPrePushSecretWarning({ riskyFiles: allDetected, findings });
    spinner.start('Đang tự động fix (gỡ khỏi stage + thêm .gitignore)...');
    const res = autoFixStagedSecrets(allDetected, targetDir);
    spinner.succeed(chalk.hex('#34D399')(`[OK] Đã xử lý xong ${res.fixed.length} file!`));
    printFixResult(res);
  }

  // Kiểm tra unpushed commits — chỉ gợi ý squash khi có dấu hiệu secret,
  // tránh viết lại lịch sử sạch không cần thiết.
  const currentBranch = getCurrentBranchStrict(targetDir) || 'main';
  const unpushed = getUnpushedCommits(currentBranch, targetDir);
  if (unpushed.length > 0 && hadSecrets) {
    printSection(`${unpushed.length} COMMIT CHƯA PUSH TRÊN LOCAL`);
    unpushed.slice(0, 5).forEach((c) => console.log(chalk.hex('#94A3B8')(`     - ${c}`)));
    if (unpushed.length > 5) {
      console.log(chalk.hex('#64748B')(`     ...và ${unpushed.length - 5} commit khác`));
    }

    let sqChoice = 'no';
    if (options.yes) {
      sqChoice = 'no';
    } else {
      sqChoice = await selectWithBack({
        message: `Gộp (squash) ${unpushed.length} commit thành 1 commit sạch để xóa vết secret cũ trong lịch sử?`,
        choices: [
          { name: 'Có, gộp thành 1 commit sạch', value: 'yes', description: 'Làm sạch hoàn toàn lịch sử commit' },
          { name: 'Không, giữ nguyên', value: 'no', description: 'Bỏ qua' }
        ]
      });
    }

    if (sqChoice !== BACK && sqChoice === 'yes') {
      spinner.start('Đang làm sạch lịch sử commit chưa push...');
      const sq = squashUnpushedCommits(currentBranch, 'Clean commit without secrets', null, targetDir);
      if (sq.ok) {
        spinner.succeed(chalk.hex('#34D399')('[OK] Đã làm sạch commit chưa push! Sẵn sàng push lên remote an toàn.'));
      } else {
        spinner.fail(chalk.red(`Không thể squash: ${sq.error}`));
      }
    }
  } else if (unpushed.length > 0) {
    console.log(chalk.hex('#64748B')(`  » Có ${unpushed.length} commit chưa push (lịch sử sạch, không cần squash).\n`));
  }

  console.log(chalk.hex('#34D399')(`\n  [OK] Quét hoàn tất trên branch ${currentBranch} — repo an toàn.\n`));
}
