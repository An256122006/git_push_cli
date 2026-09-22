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
  printCancelled
} from '../lib/ui.js';

const VERSION = '1.0.0';
const TOTAL_STEPS = 6;

async function run(options = {}) {
  printBanner(VERSION);

  // 1. Kiểm tra Git
  if (!checkGitInstalled()) {
    console.log(chalk.redBright('\n  ╭────────────────────────────────────────────────────────────╮'));
    console.log(chalk.redBright('  │  ❌  Chưa cài đặt Git. Hãy cài Git rồi chạy lại tool nhé!      │'));
    console.log(chalk.redBright('  │     👉 https://git-scm.com/downloads                         │'));
    console.log(chalk.redBright('  ╰────────────────────────────────────────────────────────────╯\n'));
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
    console.error(chalk.red(`\n  ❌ URL repository '${repoUrl}' không hợp lệ!`));
    console.log(chalk.gray('  👉 Ví dụ đúng: https://github.com/username/repository.git\n'));
    process.exit(1);
  }

  const parsedDate = parseCustomDate(dateInput);
  if (!parsedDate.valid) {
    console.error(chalk.red(`\n  ❌ ${parsedDate.error}\n`));
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
      spinner.succeed(chalk.green('✓ [1/6] Đã khởi tạo Git repo'));
    } else {
      console.log(chalk.gray('  ✓ [1/6] Đã có Git repo sẵn — bỏ qua git init'));
    }

    // [2/6] Remote
    spinner.start(stepLabel(2, TOTAL_STEPS, 'Cấu hình remote origin…'));
    setGitRemote(repoUrl);
    spinner.succeed(chalk.green('✓ [2/6] Remote origin đã xong'));

    // [3/6] Stage
    spinner.start(stepLabel(3, TOTAL_STEPS, 'Stage files (git add .)…'));
    stageAllFiles();
    spinner.succeed(chalk.green('✓ [3/6] Đã stage tất cả files'));

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
        spinner.succeed(chalk.green(`✓ Đã gỡ ${res.fixed.length} file khỏi commit`));
        if (res.fixed.length > 0) {
          console.log(chalk.gray(`   Gỡ: ${res.fixed.join(', ')}`));
        }
        if (res.gitignoreAdded.length > 0) {
          console.log(chalk.gray(`   + .gitignore: ${res.gitignoreAdded.join(', ')}`));
        }
        if (res.codeFilesWithSecrets && res.codeFilesWithSecrets.length > 0) {
          console.log(chalk.yellowBright(`   ⚠️ File mã nguồn chứa secret trong code (đã gỡ khỏi commit, không đưa vào .gitignore):`));
          res.codeFilesWithSecrets.forEach((f) => console.log(chalk.yellow(`      • ${f}`)));
        }
        if (res.failed.length > 0) {
          res.failed.forEach((f) => console.log(chalk.red(`   ✗ ${f.file}: ${f.reason}`)));
        }

        // Đảm bảo .gitignore được stage trước khi kiểm tra hasStagedChanges
        try {
          const { execSync } = await import('child_process');
          execSync('git add .gitignore', { stdio: 'ignore' });
        } catch { /* bỏ qua */ }

        if (!hasStagedChanges()) {
          console.log(chalk.yellow('\n  ⚠️  Sau khi gỡ secret thì không còn file nào để commit.'));
          console.log(chalk.gray('  File secret vẫn nằm ở máy bạn, chỉ là không push lên nữa. Tool dừng ở đây.\n'));
          process.exit(0);
        }
        console.log(chalk.green('  → Tiếp tục commit/push phần sạch còn lại.\n'));
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
      spinner.info(chalk.gray('○ [4/6] Không có thay đổi mới — dùng commit hiện có'));
    } else {
      commitWithCustomDate(commitMsg, parsedDate.formatted);
      spinner.succeed(chalk.green(`✓ [4/6] Commit xong  •  ${chalk.bold(parsedDate.display)}`));
    }

    // [5/6] Branch
    spinner.start(stepLabel(5, TOTAL_STEPS, `Đổi branch → '${branchName}'…`));
    setBranchName(branchName);
    spinner.succeed(chalk.green(`✓ [5/6] Branch: ${branchName}`));

    // [6/6] Push
    spinner.start(stepLabel(6, TOTAL_STEPS, `Push lên origin/${branchName}…`));
    pushToRemote(branchName, options.force);
    spinner.succeed(chalk.bold.green('✓ [6/6] Push thành công'));

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
      console.log(chalk.redBright('\n  ╭────────────────────────────────────────────────────────────╮'));
      console.log(chalk.redBright('  │  🔒  LỖI XÁC THỰC GIT                                      │'));
      console.log(chalk.redBright('  ╰────────────────────────────────────────────────────────────╯'));
      console.log(chalk.gray('  ' + String(error.message).split('\n')[0]));
      console.log(chalk.cyan('\n  👉 Thử: gh auth login / tạo Personal Access Token mới / dùng SSH.\n'));
    } else if (error.code === 'NON_FAST_FORWARD') {
      console.log(chalk.redBright('\n  ⚠️  Remote đã có commit mới hơn local.'));
      console.log(chalk.gray('  ' + String(error.message).split('\n')[0]));
      console.log(chalk.cyan(`\n  👉 Chạy: git pull --rebase origin ${branchName} rồi push lại.`));
      console.log(chalk.gray('     Chỉ dùng --force khi chắc chắn muốn ghi đè.\n'));
    } else {
      console.error(chalk.red(`\n  ❌ Lỗi: ${error.message}\n`));
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
    console.log(chalk.red('  ❌ Chưa cài Git. Vui lòng cài Git trước.\n'));
    process.exit(1);
  }

  if (!isGitRepo()) {
    console.log(chalk.red('  ❌ Thư mục này chưa phải là Git repository.\n'));
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
    console.log(chalk.green('\n  ✨ Không phát hiện file secret mới ở stage hay thư mục làm việc!'));
  } else {
    console.log(chalk.yellow(`\n  ⚠️  Phát hiện ${allDetected.length} file nhạy cảm:`));
    allDetected.forEach((f) => console.log(chalk.gray(`     • ${f}`)));

    spinner.start('Đang tự động fix (gỡ khỏi stage + thêm .gitignore)…');
    const res = autoFixStagedSecrets(allDetected);
    spinner.succeed(chalk.green(`✓ Đã xử lý xong ${res.fixed.length} file!`));

    if (res.fixed.length > 0) {
      console.log(chalk.gray(`     Gỡ khỏi stage: ${res.fixed.join(', ')}`));
    }
    if (res.gitignoreAdded.length > 0) {
      console.log(chalk.cyan(`     Thêm vào .gitignore: ${res.gitignoreAdded.join(', ')}`));
    }
    if (res.codeFilesWithSecrets && res.codeFilesWithSecrets.length > 0) {
      console.log(chalk.yellowBright('\n  ⚠️  CHÚ Ý FILE MÃ NGUỒN:'));
      res.codeFilesWithSecrets.forEach((f) => {
        console.log(chalk.yellow(`     • ${f}: chứa secret trong nội dung (đã gỡ khỏi stage, KHÔNG add vào .gitignore)`));
      });
      console.log(chalk.gray('     👉 Vui lòng mở các file mã nguồn trên để xóa key và thay bằng biến môi trường.\n'));
    }
    if (res.failed.length > 0) {
      res.failed.forEach((f) => console.log(chalk.red(`     ✗ Lỗi gỡ file ${f.file}: ${f.reason}`)));
    }
  }

  // Kiểm tra xem có commit chưa push nào bị dính vết secret cũ không
  const currentBranch = getCurrentBranch();
  const unpushed = getUnpushedCommits(currentBranch);
  if (unpushed.length > 0) {
    console.log(chalk.cyan(`\n  🔍 Phát hiện ${unpushed.length} commit chưa push ở local:`));
    unpushed.slice(0, 5).forEach((c) => console.log(chalk.gray(`     • ${c}`)));
    if (unpushed.length > 5) {
      console.log(chalk.gray(`     …và ${unpushed.length - 5} commit khác`));
    }
    const okSquash = await confirm({
      message: `🛠️ Bạn có muốn gộp (squash) ${unpushed.length} commit chưa push thành 1 commit sạch để xóa dấu vết secret cũ không?`,
      default: true
    });
    if (okSquash) {
      spinner.start('Đang làm sạch lịch sử commit chưa push…');
      const sq = squashUnpushedCommits(currentBranch, 'Clean commit without secrets');
      if (sq.ok) {
        spinner.succeed(chalk.green('✓ Đã làm sạch commit chưa push! Sẵn sàng push lên remote.'));
      } else {
        spinner.fail(chalk.red(`Không thể squash: ${sq.error}`));
      }
    }
  }

  console.log(chalk.bold.green('\n  🎉 Đã hoàn tất kiểm tra và fix!\n'));
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
    console.log(chalk.red('  ❌ Chưa cài npm. Cài Node.js từ https://nodejs.org rồi thử lại.\n'));
    return;
  }
  const pkg = getPackageInfo();
  if (!pkg) {
    console.log(chalk.red('  ❌ Không đọc được package.json ở thư mục hiện tại.\n'));
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
    spinner.succeed(chalk.bold.green(dryRun ? '✓ Dry-run OK — sẵn sàng publish thật' : `✓ Đã publish ${pkg.name}@${pkg.version} lên npm!`));
    if (!dryRun) {
      console.log(chalk.gray(`  👉 Kiểm tra: https://www.npmjs.com/package/${pkg.name.replace(/^@/, '').split('/')[0]}\n`));
    }
    return;
  }

  spinner.fail(chalk.red('Publish thất bại'));
  console.log(chalk.gray('  ' + res.output.split('\n').slice(-8).join('\n  ')));
  console.log(chalk.cyan(`\n  💡 ${res.parsed.hint}`));
  if (res.parsed.code === 'VERSION_EXISTS' && isInteractive) {
    const bump = await confirm({ message: 'Tự tăng patch version (npm version patch) rồi publish lại?', default: true });
    if (bump) {
      const { execSync } = await import('child_process');
      try {
        execSync('npm version patch --no-git-tag-version', { stdio: 'ignore' });
        console.log(chalk.green('  ✓ Đã tăng version, chạy lại tool với --publish để publish bản mới.\n'));
      } catch {
        console.log(chalk.red('  ❌ Không tăng được version, kiểm tra package.json.\n'));
      }
    }
  }
  console.log('');
}

const program = new Command();

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
