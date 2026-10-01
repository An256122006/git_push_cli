import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { select } from '@inquirer/prompts';
import { isValidGitUrl, parseCustomDate } from '../utils.js';
import {
  isGitRepo,
  initGitRepo,
  getGitTopLevel,
  listSubdirectories,
  resolveTargetDir,
  setGitRemote,
  stageAllFiles,
  hasChangesToCommit,
  commitWithCustomDate,
  setBranchName,
  isValidBranchName,
  pushToRemote,
  getCurrentBranch,
  findRiskyStagedFiles,
  pullFromRemote
} from '../git.js';
import { scanStagedContentForSecrets } from '../secrets.js';
import {
  autoFixStagedSecrets,
  hasStagedChanges,
  getUnpushedCommits,
  squashUnpushedCommits
} from '../fix.js';
import {
  getCurrentGitHubUser,
  listUserRepos
} from '../github.js';
import { promptCreateRepo, promptSelectGitHubAccount } from './github.js';
import { selectWithBack, inputWithBack, promptContinueOrBack, BACK } from '../prompt-helpers.js';
import {
  printSummary,
  printSection,
  stepLabel,
  printTargetDir,
  printNestedRepoWarning,
  printPrePushSecretWarning,
  printSecretBlockedBox,
  printSuccessBox,
  printCancelled,
  printErrorBox,
  printAuthFailedBox,
  printNonFastForwardBox,
  printFixResult,
  printFooter
} from '../ui.js';

const TOTAL_STEPS = 6;

/**
 * Cho user chọn folder nguồn cần push
 */
export async function promptForTargetDir(startDir) {
  const subs = listSubdirectories(startDir);
  if (subs.length === 0) return startDir;

  printSection('📁 1. CHỌN FOLDER DỰ ÁN (PROJECT)');
  printTargetDir(startDir);

  const picked = await selectWithBack({
    message: 'Thư mục nào sẽ được đẩy lên Git?',
    pageSize: Math.min(12, subs.length + 3),
    choices: [
      { name: 'Thư mục hiện tại  (.)', value: startDir, description: 'Push toàn bộ thư mục hiện tại' },
      ...subs.map((s) => ({
        name: `${s.name}`,
        value: s.fullPath,
        description: s.fullPath
      })),
      { name: 'Nhập đường dẫn khác...', value: '__custom__', description: 'Gõ tay đường dẫn tuyệt đối hoặc tương đối' }
    ]
  });

  if (picked === BACK) return BACK;
  if (picked !== '__custom__') return picked;

  const customPath = await inputWithBack({
    message: 'Nhập đường dẫn folder nguồn:',
    validate: (value) => {
      const r = resolveTargetDir(value, startDir);
      return r.ok || r.error;
    }
  });
  if (customPath === BACK) return BACK;
  return resolveTargetDir(customPath, startDir).fullPath;
}

/**
 * Xử lý khi thư mục nằm lồng trong repo cha
 */
export async function handleNestedRepo(targetDir, isInteractive, options) {
  const topLevel = getGitTopLevel(targetDir);
  if (!topLevel) return;
  if (path.resolve(topLevel) === path.resolve(targetDir)) return;
  if (fs.existsSync(path.join(targetDir, '.git'))) return;

  printNestedRepoWarning({ targetDir, topLevel });

  let choice = 'separate';
  if (isInteractive && !options.yes) {
    choice = await selectWithBack({
      message: 'Bạn muốn push thế nào?',
      choices: [
        { name: 'Tạo repo RIÊNG chỉ cho folder này (khuyên dùng)', value: 'separate', description: 'git init trong folder này, chỉ up nội dung của nó' },
        { name: 'Dùng chung repo của folder cha', value: 'shared', description: 'Giữ nguyên, push theo repo cha' },
        { name: 'x Hủy để kiểm tra lại', value: 'abort', description: 'Thoát, không làm gì' }
      ]
    });
    if (choice === BACK) return BACK;
  } else if (options.dir) {
    choice = 'separate';
  } else {
    return;
  }

  if (choice === 'abort') {
    printCancelled();
    process.exit(0);
  }
  if (choice === 'separate') {
    initGitRepo(targetDir);
    console.log(chalk.hex('#34D399')('  [OK] Đã tạo Git repo riêng cho folder này.\n'));
  } else {
    console.log(chalk.hex('#64748B')('  » Dùng chung repo cha (chỉ stage file trong folder này).\n'));
  }
}

/**
 * Prompt chọn hoặc tạo repository URL
 */
async function promptForRepoSelection(targetDir, gitHubUser = null) {
  printSection('📦 3. CHỌN REPOSITORY');

  const choices = [];

  if (gitHubUser) {
    choices.push(
      {
        name: `Chọn từ danh sách Repo của @${gitHubUser.login}`,
        value: 'pick_existing',
        description: 'Chọn nhanh từ các repo gần nhất của bạn trên GitHub'
      },
      {
        name: 'Tạo repository MỚI trên GitHub ngay lập tức',
        value: 'create_repo',
        description: `Tự động tạo repo mới trên tài khoản @${gitHubUser.login}`
      }
    );
  } else {
    choices.push(
      {
        name: 'Tạo repository MỚI trên GitHub',
        value: 'create_repo',
        description: 'Đăng nhập và tạo repository mới'
      }
    );
  }

  choices.push({
    name: 'Dán URL Git Repository thủ công',
    value: 'manual_url',
    description: 'Dán đường dẫn HTTPS hoặc SSH (GitHub, GitLab, Bitbucket...)'
  });

  const method = await selectWithBack({
    message: 'Bạn muốn chọn repository bằng cách nào?',
    choices
  });

  if (method === BACK) return BACK;

  if (method === 'create_repo') {
    const res = await promptCreateRepo({ targetDir });
    if (!res.ok || !res.repo) return BACK;
    return res.repo.cloneUrl;
  }

  if (method === 'pick_existing') {
    const spinner = ora({ text: 'Đang tải danh sách repo từ GitHub…', color: 'cyan' }).start();
    const res = await listUserRepos({ limit: 25 });
    spinner.stop();

    if (!res.ok || !res.repos || res.repos.length === 0) {
      console.log(chalk.hex('#F59E0B')('  [!] Không tìm thấy repo nào trên tài khoản này.'));
    } else {
      const repoChoices = res.repos.map((r) => ({
        name: `${r.private ? chalk.hex('#F59E0B')('[Private]') : chalk.hex('#10B981')('[Public ]')} ${chalk.hex('#F8FAFC').bold(r.name)}`,
        value: r.clone_url,
        description: r.clone_url
      }));

      const picked = await selectWithBack({
        message: 'Chọn repository bạn muốn push lên:',
        pageSize: Math.min(12, repoChoices.length + 2),
        choices: repoChoices
      });
      if (picked !== BACK) return picked;
      return BACK;
    }
  }

  // Dán URL thủ công
  const val = await inputWithBack({
    message: 'Dán link Git Repository:',
    validate: (value) => {
      if (!value || !value.trim()) return 'Vui lòng nhập đường dẫn repository!';
      if (!isValidGitUrl(value)) return 'URL chưa đúng (vd: https://github.com/user/repo.git)';
      return true;
    }
  });

  return val;
}

/**
 * Thực thi luồng Push chuẩn 7 bước
 */
export async function runPushWizard(options = {}, onBackToMenu = null) {
  const isInteractive = !options.yes;
  const fromMenu = typeof onBackToMenu === 'function';
  const startDir = process.cwd();
  // Copy flags sang object mutable để Back-navigation có thể xóa flag đã consume
  // (tránh loop vô hạn khi --repo/--branch/--message/--date còn truthy).
  const eff = { ...options };

  let targetDir = startDir;
  let selectedGitHubUser = null;
  let repoUrl = eff.repo;
  let branchName = eff.branch;
  let commitMsg = eff.message;
  let dateInput = eff.date;
  let parsedDate = null;

  if (eff.dir) {
    const r = resolveTargetDir(eff.dir, startDir);
    if (!r.ok) {
      printErrorBox('THƯ MỤC NGUỒN KHÔNG HỢP LỆ', [r.error], 'VD: --dir ./my-app  hoặc  --dir "E:/projects/my-app"');
      process.exit(1);
    }
    targetDir = r.fullPath;
  }

  if (!isInteractive) {
    if (!commitMsg) commitMsg = 'Initial commit';
    if (!dateInput) dateInput = 'now';
    if (!branchName) branchName = 'main';
    if (!repoUrl || !isValidGitUrl(repoUrl)) {
      printErrorBox('URL REPOSITORY KHÔNG HỢP LỆ', [`URL nhận được: '${repoUrl || '(trống)'}'`], 'Ví dụ đúng: https://github.com/username/repository.git');
      process.exit(1);
    }
    parsedDate = parseCustomDate(dateInput);
    if (!parsedDate.valid) {
      printErrorBox('THỜI GIAN KHÔNG HỢP LỆ', [parsedDate.error], 'VD: now, -2d, -5h, 2024-01-15 14:30:00');
      process.exit(1);
    }
    printSummary({ repoUrl, commitMsg, dateDisplay: parsedDate.display, branch: branchName, force: options.force, sourceDir: targetDir });
  } else {
    // Luồng tương tác 7 bước chuẩn:
    // 0: 📁 Chọn folder
    // 1: 👤 Chọn GitHub account
    // 2: 📦 Chọn repository
    // 3: 🌿 Chọn branch
    // 4: 💬 Nhập commit message
    // 5: ⏰ Chọn commit time
    // 6: 🚀 Xác nhận & Push
    let step = eff.dir ? 1 : 0;

    // Nếu đã truyền sẵn URL qua flag thì có thể nhảy bước chọn repo (chỉ consume 1 lần)
    if (eff.repo) {
      repoUrl = eff.repo;
      delete eff.repo;
      step = 3;
    }

    while (true) {
      // BƯỚC 0: 📁 Chọn folder project
      if (step === 0) {
        const picked = await promptForTargetDir(startDir);
        if (picked === BACK) {
          if (onBackToMenu) return await onBackToMenu();
          printCancelled();
          process.exit(0);
        }
        targetDir = picked;
        delete eff.dir;
        const nested = await handleNestedRepo(targetDir, isInteractive, eff);
        if (nested === BACK) continue;
        step = 1;
        continue;
      }

      // BƯỚC 1: 👤 Chọn GitHub account
      if (step === 1) {
        const accRes = await promptSelectGitHubAccount();
        if (accRes.back) {
          // Cho phép quay về chọn folder dù ban đầu có --dir
          delete eff.dir;
          step = 0;
          continue;
        }
        selectedGitHubUser = accRes.useGitHub ? accRes.user : null;
        step = 2;
        continue;
      }

      // BƯỚC 2: 📦 Chọn repository
      if (step === 2) {
        if (eff.repo) {
          repoUrl = eff.repo;
          delete eff.repo;
          step = 3;
          continue;
        }
        const pickedUrl = await promptForRepoSelection(targetDir, selectedGitHubUser);
        if (pickedUrl === BACK) {
          step = 1;
          continue;
        }
        repoUrl = pickedUrl;
        if (!repoUrl || !isValidGitUrl(repoUrl)) {
          printErrorBox('URL REPOSITORY KHÔNG HỢP LỆ', [`URL: '${repoUrl || '(trống)'}'`]);
          const retry = await promptContinueOrBack('URL chưa hợp lệ. Bạn muốn thử lại hay quay lại?');
          if (retry === 'exit') { printCancelled(); process.exit(0); }
          if (retry === 'back') step = 1;
          continue;
        }
        step = 3;
        continue;
      }

      // BƯỚC 3: 🌿 Chọn branch
      if (step === 3) {
        if (eff.branch) {
          branchName = eff.branch;
          delete eff.branch;
          step = 4;
          continue;
        }
        printSection('🌿 4. CHỌN BRANCH REMOTE');
        const currentB = getCurrentBranch(targetDir);
        const val = await inputWithBack({
          message: 'Tên branch trên remote:',
          default: currentB || 'main',
          validate: (v) => {
            if (!v || !v.trim()) return true;
            return isValidBranchName(v.trim()) || 'Tên branch chứa ký tự không hợp lệ (cấm space, ~ ^ : ? * [ \\ ..)';
          }
        });
        if (val === BACK) {
          step = 2;
          continue;
        }
        branchName = val || currentB || 'main';
        if (!isValidBranchName(branchName)) {
          printErrorBox('BRANCH KHÔNG HỢP LỆ', [`Tên branch: '${branchName}'`]);
          continue;
        }
        step = 4;
        continue;
      }

      // BƯỚC 4: 💬 Nhập commit message
      if (step === 4) {
        if (eff.message) {
          commitMsg = eff.message;
          delete eff.message;
          step = 5;
          continue;
        }
        printSection('💬 5. NHẬP COMMIT MESSAGE');
        const val = await inputWithBack({
          message: 'Thông điệp commit (Message):',
          default: 'Initial commit'
        });
        if (val === BACK) {
          step = 3;
          continue;
        }
        commitMsg = val || 'Initial commit';
        step = 5;
        continue;
      }

      // BƯỚC 5: ⏰ Chọn commit time
      if (step === 5) {
        if (eff.date) {
          dateInput = eff.date;
          delete eff.date;
          step = 6;
          continue;
        }
        printSection('⏰ 6. CHỌN THỜI GIAN COMMIT');
        const dateOption = await selectWithBack({
          message: 'Thời gian cho commit này:',
          choices: [
            { name: 'Ngay bây giờ', value: 'now', description: 'Sử dụng thời gian hiện tại' },
            { name: 'Lùi thời gian (Backdate)', value: 'relative', description: 'VD: -2d (2 ngày trước), -5h, -30m, -1w' },
            { name: 'Ngày giờ cụ thể', value: 'custom', description: 'VD: 2024-01-15 14:30:00' }
          ]
        });
        if (dateOption === BACK) {
          step = 4;
          continue;
        }

        if (dateOption === 'now') {
          dateInput = 'now';
        } else if (dateOption === 'relative') {
          const val = await inputWithBack({
            message: 'Nhập thời gian lùi (VD: -2d, -5h, -30m, -1w):',
            default: '-1d',
            validate: (v) => { const p = parseCustomDate(v); return p.valid || p.error || 'Thời gian không hợp lệ'; }
          });
          if (val === BACK) continue;
          dateInput = val;
        } else if (dateOption === 'custom') {
          const val = await inputWithBack({
            message: 'Nhập ngày giờ (YYYY-MM-DD HH:mm:ss):',
            default: '2024-01-15 10:00:00',
            validate: (v) => { const p = parseCustomDate(v); return p.valid || p.error || 'Ngày giờ không hợp lệ'; }
          });
          if (val === BACK) continue;
          dateInput = val;
        }

        parsedDate = parseCustomDate(dateInput || 'now');
        if (!parsedDate.valid) {
          printErrorBox('THỜI GIAN KHÔNG HỢP LỆ', [parsedDate.error]);
          const retry = await promptContinueOrBack('Thời gian chưa đúng. Bạn muốn nhập lại hay quay lại?');
          if (retry === 'exit') { printCancelled(); process.exit(0); }
          dateInput = undefined;
          delete eff.date;
          if (retry === 'back') step = 4;
          continue;
        }
        step = 6;
        continue;
      }

      // BƯỚC 6: 🚀 Xác nhận & Đẩy lên
      if (step === 6) {
        if (!commitMsg) commitMsg = 'Initial commit';
        if (!dateInput) dateInput = 'now';
        if (!branchName) branchName = 'main';
        parsedDate = parseCustomDate(dateInput);

        printSummary({
          repoUrl,
          commitMsg,
          dateDisplay: parsedDate.display,
          branch: branchName,
          force: options.force,
          sourceDir: targetDir
        });

        const decision = await select({
          message: 'Xác nhận đẩy dự án lên Git ngay?',
          choices: [
            { name: 'Bắt đầu đẩy code (Push)', value: 'continue', description: 'Thực thi git init/add/commit/push' },
            { name: 'Sửa thời gian commit', value: 'back-date', description: 'Về bước chọn thời gian' },
            { name: 'Sửa commit message', value: 'back-msg', description: 'Về bước nhập message' },
            { name: 'Sửa branch', value: 'back-branch', description: 'Về bước chọn branch' },
            { name: 'Sửa repository', value: 'back-repo', description: 'Về bước chọn repository' },
            { name: 'Sửa tài khoản GitHub', value: 'back-account', description: 'Về bước chọn tài khoản GitHub' },
            { name: 'Chọn lại folder dự án', value: 'back-folder', description: 'Về bước chọn thư mục' },
            { name: 'Về menu chính', value: 'back-menu', description: 'Quay lại màn hình điều khiển' },
            { name: 'x Hủy bỏ', value: 'exit', description: 'Thoát' }
          ]
        });

        if (decision === 'exit') { printCancelled(); process.exit(0); }
        if (decision === 'continue') break;
        if (decision === 'back-date') { dateInput = undefined; delete eff.date; parsedDate = null; step = 5; continue; }
        if (decision === 'back-msg') { commitMsg = undefined; delete eff.message; step = 4; continue; }
        if (decision === 'back-branch') { branchName = undefined; delete eff.branch; step = 3; continue; }
        if (decision === 'back-repo') { repoUrl = undefined; delete eff.repo; step = 2; continue; }
        if (decision === 'back-account') { step = 1; continue; }
        if (decision === 'back-folder') { delete eff.dir; step = 0; continue; }
        if (decision === 'back-menu') {
          if (onBackToMenu) return await onBackToMenu();
          step = options.dir ? 1 : 0;
          continue;
        }
      }
    }
  }

  // 🚀 BƯỚC 7: THỰC THI PUSH
  const spinner = ora({ color: 'cyan' });
  printSection(`🚀 ĐANG ĐẨY CODE LÊN GIT (${TOTAL_STEPS} BƯỚC)`);

  try {
    // 1. Git init
    if (!isGitRepo(targetDir)) {
      spinner.start(stepLabel(1, TOTAL_STEPS, 'Khởi tạo Git repo (git init)...'));
      initGitRepo(targetDir);
      spinner.succeed(stepLabel(1, TOTAL_STEPS, chalk.hex('#34D399')('Đã khởi tạo Git repo')));
    } else {
      console.log('  ' + stepLabel(1, TOTAL_STEPS, chalk.hex('#64748B')('Đã có Git repo sẵn — bỏ qua init')));
    }

    // 2. Remote
    spinner.start(stepLabel(2, TOTAL_STEPS, 'Cấu hình remote origin...'));
    setGitRemote(repoUrl, targetDir);
    spinner.succeed(stepLabel(2, TOTAL_STEPS, chalk.hex('#34D399')('Cấu hình remote origin hoàn tất')));

    // 3. Stage
    spinner.start(stepLabel(3, TOTAL_STEPS, 'Stage files (git add .)...'));
    stageAllFiles(targetDir);
    spinner.succeed(stepLabel(3, TOTAL_STEPS, chalk.hex('#34D399')('Đã stage toàn bộ files')));

    // 3.5. Quét secret nhạy cảm
    const risky = findRiskyStagedFiles(targetDir);
    const findings = scanStagedContentForSecrets(targetDir);
    if (risky.length > 0 || findings.length > 0) {
      spinner.stop();
      printPrePushSecretWarning({ riskyFiles: risky, findings });
      const allFiles = [...new Set([...risky, ...findings.map((f) => f.file)])];

      let wantFix = options.fix === true;
      if (!wantFix && isInteractive) {
        const fixChoice = await selectWithBack({
          message: 'Tự động gỡ file secret an toàn? (giữ nguyên file ở máy, gỡ khỏi commit)',
          choices: [
            { name: 'Có, tự động gỡ file nhạy cảm', value: 'yes', description: 'Gỡ file secret khỏi stage & thêm .gitignore' },
            { name: 'Không, giữ nguyên', value: 'no', description: 'Tiếp tục mà không gỡ' }
          ]
        });
        if (fixChoice === BACK) {
          printCancelled();
          process.exit(0);
        }
        wantFix = fixChoice === 'yes';
      }

      if (wantFix) {
        spinner.start('Đang tự fix: gỡ file secret khỏi stage...');
        const res = autoFixStagedSecrets(allFiles, targetDir);
        spinner.succeed(chalk.hex('#34D399')(`[OK] Đã gỡ ${res.fixed.length} file khỏi commit`));
        printFixResult(res);

        spawnSync('git', ['add', '.gitignore'], { cwd: targetDir, stdio: 'ignore' });

        if (!hasStagedChanges(targetDir)) {
          printErrorBox('KHÔNG CÒN FILE ĐỂ COMMIT', [
            'Sau khi gỡ secret thì không còn file nào để commit.',
            'File của bạn vẫn còn trên máy, không bị mất.'
          ]);
          if (fromMenu) return 'back';
          process.exit(0);
        }
        console.log(chalk.hex('#34D399')('  » Tiếp tục commit/push phần code an toàn.\n'));
      }
    }

    // 4. Commit
    spinner.start(stepLabel(4, TOTAL_STEPS, `Tạo commit [${parsedDate.display}]...`));
    if (!hasChangesToCommit(targetDir)) {
      spinner.info(stepLabel(4, TOTAL_STEPS, chalk.hex('#94A3B8')('Không có thay đổi mới — dùng commit hiện có')));
    } else {
      commitWithCustomDate(commitMsg, parsedDate.formatted, targetDir);
      spinner.succeed(stepLabel(4, TOTAL_STEPS, chalk.hex('#34D399')(`Commit hoàn tất  •  ${chalk.hex('#C084FC').bold(parsedDate.display)}`)));
    }

    // 5. Branch
    spinner.start(stepLabel(5, TOTAL_STEPS, `Đổi branch -> '${branchName}'...`));
    setBranchName(branchName, targetDir);
    spinner.succeed(stepLabel(5, TOTAL_STEPS, chalk.hex('#34D399')(`Branch: ${chalk.hex('#5EEAD4').bold(branchName)}`)));

    // 6. Push
    spinner.start(stepLabel(6, TOTAL_STEPS, `Push lên origin/${branchName}...`));
    pushToRemote(branchName, options.force, targetDir);
    spinner.succeed(stepLabel(6, TOTAL_STEPS, chalk.bold.hex('#34D399')('Push lên remote thành công!')));

    printSuccessBox({ branch: branchName, repoUrl });
    printFooter();
  } catch (error) {
    spinner.stop();
    if (error.code === 'SECRET_BLOCKED') {
      printSecretBlockedBox(error.message, error.details || {});

      const unpushed = getUnpushedCommits(branchName, targetDir);
      if (unpushed.length > 0) {
        console.log(chalk.cyanBright(`\n  » Phát hiện bạn có ${unpushed.length} commit chưa push có thể chứa vết secret cũ.`));
        let doSquash = options.fix === true;
        if (!doSquash && isInteractive) {
          const sqChoice = await selectWithBack({
            message: 'Tự động làm sạch lịch sử (squash các commit thành 1 commit sạch) để push lại?',
            choices: [
              { name: 'Có, squash và push lại ngay', value: 'yes', description: 'Làm sạch commit' },
              { name: 'Không, để tự xử lý', value: 'no', description: 'Dừng' }
            ]
          });
          doSquash = sqChoice === 'yes';
        }
        if (doSquash) {
          spinner.start('Đang squash và làm sạch commit chưa push...');
          const sqRes = squashUnpushedCommits(branchName, commitMsg, parsedDate.formatted, targetDir);
          if (sqRes.ok) {
            spinner.succeed(chalk.green('[OK] Đã làm sạch commit! Đang thử push lại...'));
            try {
              spinner.start(stepLabel(6, TOTAL_STEPS, `Push lại lên origin/${branchName}...`));
              pushToRemote(branchName, options.force, targetDir);
              spinner.succeed(chalk.bold.green('[OK] Push thành công'));
              printSuccessBox({ branch: branchName, repoUrl });
              printFooter();
              return;
            } catch (retryErr) {
              spinner.fail(chalk.red(`Push lại thất bại: ${retryErr.message}`));
            }
          } else {
            spinner.fail(chalk.red(`Không thể squash: ${sqRes.error}`));
          }
        }
      }
    } else if (error.code === 'AUTH_FAILED') {
      printAuthFailedBox(error.message);
    } else if (error.code === 'NON_FAST_FORWARD') {
      printNonFastForwardBox(error.message, branchName);
      if (isInteractive) {
        const ffChoice = await select({
          message: 'Remote đã có commit mới hơn. Bạn muốn xử lý thế nào?',
          choices: [
            { name: 'Pull (rebase) rồi push lại — Khuyên dùng', value: 'pull-push', description: `git pull --rebase origin ${branchName} rồi push lại` },
            { name: 'Chỉ Pull về (chưa push vội)', value: 'pull-only', description: 'Chỉ đồng bộ code về máy' },
            { name: 'Quay lại menu chính', value: 'back', description: 'Về màn hình điều khiển' },
            { name: 'x Thoát', value: 'exit', description: 'Dừng lại' }
          ]
        });
        if (ffChoice === 'pull-push' || ffChoice === 'pull-only') {
          try {
            spinner.start(`Đang pull --rebase origin/${branchName}...`);
            const pullOut = pullFromRemote('origin', branchName, targetDir, { rebase: true });
            spinner.succeed(chalk.hex('#34D399')(`Đã pull --rebase origin/${branchName} xong`));
            if (pullOut) console.log(chalk.hex('#64748B')(`  ${String(pullOut).split('\n')[0].slice(0, 120)}`));
            if (ffChoice === 'pull-push') {
              spinner.start(stepLabel(6, TOTAL_STEPS, `Push lại lên origin/${branchName}...`));
              pushToRemote(branchName, options.force, targetDir);
              spinner.succeed(chalk.bold.hex('#34D399')('Push lại thành công sau khi pull!'));
              printSuccessBox({ branch: branchName, repoUrl });
              printFooter();
              return;
            }
            console.log(chalk.hex('#34D399')('\n  [OK] Đã pull code mới nhất về.\n'));
            if (fromMenu) return 'back';
            return;
          } catch (pullErr) {
            spinner.fail(chalk.red(`Pull --rebase thất bại: ${String(pullErr.message).split('\n')[0]}`));
            printErrorBox('PULL --REBASE THẤT BẠI', [String(pullErr.message).split('\n')[0]]);
            if (fromMenu) return 'back';
            return;
          }
        } else if (ffChoice === 'back' && onBackToMenu) {
          return await onBackToMenu();
        }
      }
    } else if (error.code === 'REMOTE_OR_NETWORK') {
      printErrorBox('LỖI KẾT NỐI REMOTE', [String(error.message).split('\n')[0]], 'Kiểm tra URL repo, mạng, và quyền truy cập.');
    } else {
      printErrorBox('ĐẨY LÊN GIT THẤT BẠI', [error.message]);
    }
    // Khi chạy từ menu tương tác: quay về menu thay vì kill process
    if (fromMenu) return 'back';
    process.exit(1);
  }
}
