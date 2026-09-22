#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { input, select, confirm } from '@inquirer/prompts';
import { isValidGitUrl, parseCustomDate } from '../lib/utils.js';
import {
  checkGitInstalled,
  isGitRepo,
  initGitRepo,
  setGitRemote,
  stageAllFiles,
  hasChangesToCommit,
  commitWithCustomDate,
  setBranchName,
  pushToRemote,
  getCurrentBranch,
  findRiskyStagedFiles
} from '../lib/git.js';
import { scanStagedContentForSecrets } from '../lib/secrets.js';
import {
  autoFixStagedSecrets,
  hasStagedChanges,
  findRiskyWorkingTreeFiles,
  getUnpushedCommits,
  squashUnpushedCommits
} from '../lib/fix.js';
import {
  checkNpmInstalled,
  getPackageInfo,
  checkNpmLogin,
  isNpmrcTracked,
  publishToNpm
} from '../lib/npm.js';
import {
  printBanner,
  printSummary,
  printSection,
  stepLabel,
  printPrePushSecretWarning,
  printSecretBlockedBox,
  printSuccessBox,
  printCancelled,
  printErrorBox,
  printGitMissing,
  printAuthFailedBox,
  printNonFastForwardBox,
  printFixResult,
  printNpmResult,
  printFooter,
  styleCliHelp
} from '../lib/ui.js';

const VERSION = '1.0.0';
const TOTAL_STEPS = 6;

async function run(options = {}) {
  printBanner(VERSION);

  // 1. Kiểm tra Git
  if (!checkGitInstalled()) {
    printBanner(VERSION);
    printGitMissing();
    process.exit(1);
  }

  let repoUrl = options.repo;
  let commitMsg = options.message;
  let dateInput = options.date;
  let branchName = options.branch || 'main';

  const isInteractive = !options.yes;

  // 2. Thu thập thông tin
  if (isInteractive) {
    printSection('🔗  KẾT NỐI REPOSITORY');

    if (!repoUrl) {
      repoUrl = await input({
        message: '📦 Dán link Git Repository:',
        validate: (value) => {
          if (!value || !value.trim()) return 'Vui lòng nhập đường dẫn repository!';
          if (!isValidGitUrl(value)) return 'URL chưa đúng (vd: https://github.com/user/repo.git)';
          return true;
        }
      });
    }

    if (!commitMsg) {
      commitMsg = await input({
        message: '💬 Thông điệp commit:',
        default: 'Initial commit'
      });
    }

    if (!dateInput) {
      printSection('⏰  THỜI GIAN COMMIT');
      const dateOption = await select({
        message: 'Chọn thời gian cho commit:',
        choices: [
          { name: '⏰  Ngay bây giờ', value: 'now', description: 'Dùng thời gian hiện tại' },
          { name: '⏳  Lùi thời gian', value: 'relative', description: 'VD: -2d, -5h, -30m, -1w' },
          { name: '📅  Ngày giờ cụ thể', value: 'custom', description: 'VD: 2024-01-15 14:30:00' }
        ]
      });

      if (dateOption === 'now') {
        dateInput = 'now';
      } else if (dateOption === 'relative') {
        dateInput = await input({
          message: '⏳ Nhập thời gian lùi (VD: -2d, -5h, -30m, -1w):',
          default: '-1d',
          validate: (val) => {
            const parsed = parseCustomDate(val);
            return parsed.valid || parsed.error || 'Thời gian không hợp lệ';
          }
        });
      } else if (dateOption === 'custom') {
        dateInput = await input({
          message: '📅 Nhập ngày giờ (YYYY-MM-DD HH:mm:ss):',
          default: '2024-01-15 10:00:00',
          validate: (val) => {
            const parsed = parseCustomDate(val);
            return parsed.valid || parsed.error || 'Ngày giờ không hợp lệ';
          }
        });
      }
    }

    if (!options.branch) {
      const currentB = getCurrentBranch();
      branchName = await input({
        message: '🌿 Branch trên remote:',
        default: currentB || 'main'
      });
    }
  }

  if (!commitMsg) commitMsg = 'Initial commit';
  if (!dateInput) dateInput = 'now';
  if (!branchName) branchName = 'main';

  if (!repoUrl || !isValidGitUrl(repoUrl)) {
    printErrorBox('URL REPOSITORY KHÔNG HỢP LỆ', [
      `URL nhận được: '${repoUrl || '(trống)'}'`,
    ], 'Ví dụ đúng: https://github.com/username/repository.git');
    process.exit(1);
  }

  const parsedDate = parseCustomDate(dateInput);
  if (!parsedDate.valid) {
    printErrorBox('THỜI GIAN KHÔNG HỢP LỆ', [parsedDate.error], 'VD: now, -2d, -5h, 2024-01-15 14:30:00');
    process.exit(1);
  }

  // Tóm tắt
  printSummary({
    repoUrl,
    commitMsg,
    dateDisplay: parsedDate.display,
    branch: branchName,
    force: options.force
  });

  if (isInteractive) {
    const ok = await confirm({
      message: '🚀 Xác nhận đẩy lên Git ngay?',
      default: true
    });
    if (!ok) {
      printCancelled();
      process.exit(0);
    }
  }

  // 3. Thực thi
  const spinner = ora({ color: 'cyan' });
  printSection(`⚙️   ĐANG TRIỂN KHAI  (${TOTAL_STEPS} bước)`);

  try {
    // [1/6] Git init
    if (!isGitRepo()) {
      spinner.start(stepLabel(1, TOTAL_STEPS, 'Khởi tạo Git repo (git init)…'));
      initGitRepo();
      spinner.succeed(stepLabel(1, TOTAL_STEPS, chalk.hex('#34D399')('Đã khởi tạo Git repo')));
    } else {
      console.log('  ' + stepLabel(1, TOTAL_STEPS, chalk.hex('#64748B')('Đã có Git repo sẵn — bỏ qua init')));
    }

    // [2/6] Remote
    spinner.start(stepLabel(2, TOTAL_STEPS, 'Cấu hình remote origin…'));
    setGitRemote(repoUrl);
    spinner.succeed(stepLabel(2, TOTAL_STEPS, chalk.hex('#34D399')('Cấu hình remote origin hoàn tất')));

    // [3/6] Stage
    spinner.start(stepLabel(3, TOTAL_STEPS, 'Stage files (git add .)…'));
    stageAllFiles();
    spinner.succeed(stepLabel(3, TOTAL_STEPS, chalk.hex('#34D399')('Đã stage toàn bộ files')));

    // [3.5] Quét secret: tên file + nội dung
    const risky = findRiskyStagedFiles();
    const findings = scanStagedContentForSecrets();
    if (risky.length > 0 || findings.length > 0) {
      spinner.stop();
      printPrePushSecretWarning({ riskyFiles: risky, findings });
      const allFiles = [...new Set([...risky, ...findings.map((f) => f.file)])];

      let wantFix = options.fix === true;
      if (!wantFix && isInteractive) {
        wantFix = await confirm({
          message: `🛠️  Tự động fix giúp bạn? (git rm --cached + thêm .gitignore, giữ file ở máy)`,
          default: true
        });
      }

      if (wantFix) {
        spinner.start('Đang tự fix: gỡ file secret khỏi stage…');
        const res = autoFixStagedSecrets(allFiles);
        spinner.succeed(chalk.hex('#34D399')(`✓ Đã gỡ ${res.fixed.length} file khỏi commit`));
        printFixResult(res);

        // Đảm bảo .gitignore được stage trước khi kiểm tra hasStagedChanges
        try {
          const { execSync } = await import('child_process');
          execSync('git add .gitignore', { stdio: 'ignore' });
        } catch { /* bỏ qua */ }

        if (!hasStagedChanges()) {
          printErrorBox('KHÔNG CÒN FILE ĐỂ COMMIT', [
            'Sau khi gỡ secret thì không còn file nào để commit.',
            'File secret vẫn nằm ở máy bạn, chỉ là không push lên nữa.',
          ]);
          process.exit(0);
        }
        console.log(chalk.hex('#34D399')('  → Tiếp tục commit/push phần sạch còn lại.\n'));
      } else if (isInteractive) {
        const keepGoing = await confirm({
          message: findings.length > 0
            ? `⚠️  Phát hiện ${findings.length} vị trí giống secret. Vẫn tiếp tục mà không fix?`
            : 'Vẫn tiếp tục commit/push với các file trên mà không fix?',
          default: false
        });
        if (!keepGoing) {
          console.log(chalk.cyan('\n  🛠️  Chạy lại với --fix để tool tự gỡ giúp bạn, hoặc làm tay:'));
          allFiles.forEach((f) => console.log(chalk.white(`     git rm --cached "${f}"`)));
          console.log(chalk.gray('  Sau đó chạy lại tool.\n'));
          process.exit(0);
        }
        console.log(chalk.yellow('  → Bạn chọn tiếp tục với file nhạy cảm. Nếu push bị chặn, tool sẽ hướng dẫn tiếp.\n'));
      } else {
        console.log(chalk.yellow('  ⚠️  Chế độ -y: vẫn tiếp tục dù phát hiện file nhạy cảm. Dùng --fix để tự gỡ.\n'));
      }
    }

    // [4/6] Commit
    spinner.start(stepLabel(4, TOTAL_STEPS, `Tạo commit [${parsedDate.display}]…`));
    if (!hasChangesToCommit()) {
      spinner.info(stepLabel(4, TOTAL_STEPS, chalk.hex('#94A3B8')('Không có thay đổi mới — dùng commit hiện có')));
    } else {
      commitWithCustomDate(commitMsg, parsedDate.formatted);
      spinner.succeed(stepLabel(4, TOTAL_STEPS, chalk.hex('#34D399')(`Commit hoàn tất  •  ${chalk.hex('#C084FC').bold(parsedDate.display)}`)));
    }

    // [5/6] Branch
    spinner.start(stepLabel(5, TOTAL_STEPS, `Đổi branch → '${branchName}'…`));
    setBranchName(branchName);
    spinner.succeed(stepLabel(5, TOTAL_STEPS, chalk.hex('#34D399')(`Branch: ${chalk.hex('#5EEAD4').bold(branchName)}`)));

    // [6/6] Push
    spinner.start(stepLabel(6, TOTAL_STEPS, `Push lên origin/${branchName}…`));
    pushToRemote(branchName, options.force);
    spinner.succeed(stepLabel(6, TOTAL_STEPS, chalk.bold.hex('#34D399')('Push lên remote thành công!')));

    printSuccessBox({ branch: branchName, repoUrl });

    // [+1] Publish npm (optional)
    let wantPublish = options.publish === true;
    if (!wantPublish && isInteractive) {
      wantPublish = await confirm({
        message: '📦 Publish package này lên npm luôn không?',
        default: false
      });
    }
    if (wantPublish) {
      await runNpmPublish({ access: options.access, dryRun: options.dryRun, isInteractive });
    } else {
      printFooter();
    }
  } catch (error) {
    spinner.stop();
    if (error.code === 'SECRET_BLOCKED') {
      printSecretBlockedBox(error.message, error.details || {});

      // Kiểm tra xem có commit unpushed chứa vết secret cũ không để hỗ trợ squash tự động
      const unpushed = getUnpushedCommits(branchName);
      if (unpushed.length > 0) {
        console.log(chalk.cyanBright(`\n  💡 Phát hiện bạn có ${unpushed.length} commit chưa push ở local có thể chứa vết secret cũ.`));
        let doSquash = options.fix === true;
        if (!doSquash && isInteractive) {
          doSquash = await confirm({
            message: '🛠️ Tự động làm sạch lịch sử (squash các commit unpushed thành 1 commit sạch) để push lại?',
            default: true
          });
        }
        if (doSquash) {
          spinner.start('Đang squash và làm sạch commit chưa push…');
          const sqRes = squashUnpushedCommits(branchName, commitMsg, parsedDate.formatted);
          if (sqRes.ok) {
            spinner.succeed(chalk.green('✓ Đã làm sạch commit! Đang thử push lại…'));
            try {
              spinner.start(stepLabel(6, TOTAL_STEPS, `Push lại lên origin/${branchName}…`));
              pushToRemote(branchName, options.force);
              spinner.succeed(chalk.bold.green('✓ Push thành công'));
              printSuccessBox({ branch: branchName, repoUrl });
              printFooter();
              return;
            } catch (retryErr) {
              spinner.fail(chalk.red(`Push lại thất bại: ${retryErr.message}`));
            }
          } else {
            spinner.fail(chalk.red(`Không thể tự động squash: ${sqRes.error}`));
          }
        }
      }
    } else if (error.code === 'AUTH_FAILED') {
      printAuthFailedBox(error.message);
    } else if (error.code === 'NON_FAST_FORWARD') {
      printNonFastForwardBox(error.message, branchName);
    } else if (error.code === 'REMOTE_OR_NETWORK') {
      printErrorBox('LỖI KẾT NỐI REMOTE', [String(error.message).split('\n')[0]], 'Kiểm tra URL repo, mạng, và quyền truy cập.');
    } else {
      printErrorBox('ĐẨY LÊN GIT THẤT BẠI', [error.message]);
    }
    process.exit(1);
  }
}

/**
 * Lệnh fix độc lập: `git-push-time fix`
 * Tự động quét và fix secret ở staged, working directory và unpushed commits.
 */
async function runFixCommand() {
  printBanner(VERSION);
  printSection('🛠️  TỰ ĐỘNG FIX SECRET & BẢO VỆ REPO');

  if (!checkGitInstalled()) {
    printGitMissing();
    process.exit(1);
  }

  if (!isGitRepo()) {
    printErrorBox('CHƯA PHẢI GIT REPOSITORY', ['Thư mục này chưa phải là Git repository.'], 'Chạy git init hoặc cd vào đúng thư mục dự án.');
    process.exit(1);
  }

  const spinner = ora({ color: 'cyan' });
  spinner.start('Đang kiểm tra staged files và thư mục làm việc…');

  const risky = findRiskyStagedFiles();
  const findings = scanStagedContentForSecrets();
  const riskyWorking = findRiskyWorkingTreeFiles();
  spinner.stop();

  const allDetected = [...new Set([...risky, ...findings.map((f) => f.file), ...riskyWorking])];

  if (allDetected.length === 0) {
    printSection('✨  KẾT QUẢ QUÉT');
    console.log(chalk.hex('#34D399')('  ✨ Không phát hiện file secret mới ở stage hay thư mục làm việc!\n'));
  } else {
    printPrePushSecretWarning({ riskyFiles: allDetected, findings });
    spinner.start('Đang tự động fix (gỡ khỏi stage + thêm .gitignore)…');
    const res = autoFixStagedSecrets(allDetected);
    spinner.succeed(chalk.hex('#34D399')(`✓ Đã xử lý xong ${res.fixed.length} file!`));
    printFixResult(res);
  }

  // Kiểm tra xem có commit chưa push nào bị dính vết secret cũ không
  const currentBranch = getCurrentBranch();
  const unpushed = getUnpushedCommits(currentBranch);
  if (unpushed.length > 0) {
    printSection(`🔍  ${unpushed.length} COMMIT CHƯA PUSH`);
    unpushed.slice(0, 5).forEach((c) => console.log(chalk.hex('#94A3B8')(`     • ${c}`)));
    if (unpushed.length > 5) {
      console.log(chalk.hex('#64748B')(`     …và ${unpushed.length - 5} commit khác`));
    }
    const okSquash = await confirm({
      message: `🛠️ Bạn có muốn gộp (squash) ${unpushed.length} commit chưa push thành 1 commit sạch để xóa dấu vết secret cũ không?`,
      default: true
    });
    if (okSquash) {
      spinner.start('Đang làm sạch lịch sử commit chưa push…');
      const sq = squashUnpushedCommits(currentBranch, 'Clean commit without secrets');
      if (sq.ok) {
        spinner.succeed(chalk.hex('#34D399')('✓ Đã làm sạch commit chưa push! Sẵn sàng push lên remote.'));
      } else {
        spinner.fail(chalk.red(`Không thể squash: ${sq.error}`));
      }
    }
  }

  printSuccessBox({ branch: currentBranch || 'main', repoUrl: 'local repo đã sạch — sẵn sàng push' });
}

/**
 * Publish lên npm sau khi push Git xong.
 * An toàn: không nhận token qua flag, dùng `npm login` hoặc env NPM_TOKEN.
 * Nếu .npmrc đang bị track trong git thì cảnh báo (không in token).
 */
async function runNpmPublish({ access = 'public', dryRun = false, isInteractive = true } = {}) {
  const spinner = ora({ color: 'magenta' });
  printSection('📦  PUBLISH LÊN NPM');

  if (!checkNpmInstalled()) {
    printErrorBox('CHƯA CÀI NPM', ['Chưa phát hiện npm trên máy.'], 'Cài Node.js từ https://nodejs.org rồi thử lại.');
    return;
  }
  const pkg = getPackageInfo();
  if (!pkg) {
    printErrorBox('KHÔNG ĐỌC ĐƯỢC PACKAGE.JSON', ['Không tìm thấy package.json ở thư mục hiện tại.'], 'cd vào đúng thư mục dự án rồi chạy lại.');
    return;
  }
  console.log(chalk.gray(`  📦 Package: ${chalk.white(pkg.name)}@${chalk.white(pkg.version)}  •  access: ${access}${dryRun ? '  •  dry-run' : ''}`));

  if (isNpmrcTracked()) {
    console.log(chalk.yellowBright('\n  ⚠️  Phát hiện .npmrc đang nằm trong git.'));
    console.log(chalk.gray('     File này thường chứa token, không nên commit/publish cùng code.'));
    console.log(chalk.gray('     Tool sẽ publish mà không cần commit .npmrc — hãy gỡ nó: git rm --cached .npmrc\n'));
  }

  const login = checkNpmLogin();
  if (!login.loggedIn && !process.env.NPM_TOKEN && !process.env.NODE_AUTH_TOKEN) {
    console.log(chalk.yellow('  🔒 Chưa login npm.'));
    console.log(chalk.cyan('  👉 Chạy: npm login   (hoặc export NPM_TOKEN=... khi chạy CI)'));
    if (isInteractive) {
      const go = await confirm({ message: 'Đã login xong, publish tiếp?', default: false });
      if (!go) {
        console.log(chalk.gray('  Đã bỏ qua publish npm.\n'));
        return;
      }
    } else {
      console.log(chalk.gray('  Chế độ -y mà chưa login nên bỏ qua publish.\n'));
      return;
    }
  } else if (login.loggedIn) {
    console.log(chalk.gray(`  👤 npm user: ${login.user}`));
  }

  spinner.start(dryRun ? 'Chạy thử npm publish --dry-run…' : `Đang publish ${pkg.name}@${pkg.version}…`);
  const res = publishToNpm({ access, dryRun, cwd: process.cwd() });
  if (res.ok) {
    spinner.stop();
    printNpmResult({ ok: true, pkgName: pkg.name, version: pkg.version, dryRun });
    printFooter();
    return;
  }

  spinner.fail(chalk.red('Publish thất bại'));
  printNpmResult({ ok: false, pkgName: pkg.name, version: pkg.version, output: res.output, hint: res.parsed.hint, dryRun });
  if (res.parsed.code === 'VERSION_EXISTS' && isInteractive) {
    const bump = await confirm({ message: 'Tự tăng patch version (npm version patch) rồi publish lại?', default: true });
    if (bump) {
      const { execSync } = await import('child_process');
      try {
        execSync('npm version patch --no-git-tag-version', { stdio: 'ignore' });
        console.log(chalk.hex('#34D399')('  ✓ Đã tăng version, chạy lại tool với --publish để publish bản mới.\n'));
      } catch {
        printErrorBox('KHÔNG TĂNG ĐƯỢC VERSION', ['Kiểm tra lại package.json.']);
      }
    }
  }
  printFooter();
}

const program = new Command();
styleCliHelp(program);

program
  .name('git-push-time')
  .description('Đẩy dự án lên Git siêu tốc + tùy chỉnh thời gian commit (Backdate Commit)')
  .version(VERSION)
  .option('-r, --repo <url>', 'Đường dẫn Git repository (URL)')
  .option('-d, --date <datetime>', 'Thời gian commit (Ví dụ: "2024-01-15 14:30:00", "-2d", "-5h", "now")')
  .option('-m, --message <msg>', 'Thông điệp commit (Commit message)')
  .option('-b, --branch <branch>', 'Tên branch trên remote (Mặc định: main)')
  .option('-f, --force', 'Thực hiện push đè (--force)', false)
  .option('-y, --yes', 'Bỏ qua prompt tương tác, tự động dùng tham số hoặc giá trị mặc định', false)
  .option('--fix', 'Tự động gỡ file secret khỏi stage + thêm .gitignore (an toàn, không xóa file thật)', false)
  .option('--publish', 'Publish lên npm sau khi push Git thành công', false)
  .option('--access <mode>', 'Quyền publish npm (public|restricted)', 'public')
  .option('--dry-run', 'Chạy thử npm publish mà không publish thật', false)
  .action(async (opts) => {
    await run(opts);
  });

program
  .command('fix')
  .description('Tự động quét và gỡ file secret khỏi stage, thêm vào .gitignore và làm sạch commit chưa push')
  .action(async () => {
    await runFixCommand();
  });

program.parse(process.argv);
