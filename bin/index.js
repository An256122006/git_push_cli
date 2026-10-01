#!/usr/bin/env node

import { Command } from 'commander';
import { select } from '@inquirer/prompts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkGitInstalled, getCurrentBranch } from '../lib/git.js';
import { getCurrentGitHubUser } from '../lib/github.js';
import { runPushWizard } from '../lib/commands/push.js';
import { runPullCommand } from '../lib/commands/pull.js';
import { runEditCommitTimeCommand } from '../lib/commands/edit-time.js';
import { runFixCommand } from '../lib/commands/fix.js';
import {
  runGitHubMenu,
  promptCreateRepo,
  showUserRepos,
} from '../lib/commands/github.js';
import { promptContinueOrBack } from '../lib/prompt-helpers.js';
import {
  printBanner,
  printDashboardStatus,
  printSection,
  printGitMissing,
  printCancelled,
  styleCliHelp
} from '../lib/ui.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getPackageVersion() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8');
    return JSON.parse(raw).version || '1.1.0';
  } catch {
    return '1.1.0';
  }
}

const VERSION = getPackageVersion();

function isExitPromptError(err) {
  const msg = String(err?.message || '');
  return (
    err?.name === 'ExitPromptError' ||
    msg.includes('User force closed the prompt') ||
    msg.includes('SIGINT')
  );
}

/**
 * Kiểm tra xem lệnh có được gọi "trần" (không flag/subcommand nào) hay không.
 */
function isBareInvocation(options = {}) {
  return (
    !options.repo &&
    !options.message &&
    !options.date &&
    !options.branch &&
    !options.dir &&
    !options.force &&
    !options.fix
  );
}

/**
 * Menu chính khi chạy `git-push-time` không truyền flag
 */
async function promptMainMenu() {
  printSection('BẢNG ĐIỀU KHIỂN CHÍNH');
  return await select({
    message: 'Bạn muốn thực hiện thao tác nào?',
    pageSize: 10,
    choices: [
      {
        name: 'Đẩy dự án lên Git',
        value: 'push',
        description: 'Chọn repository, thời gian commit và đẩy code'
      },
      {
        name: 'Quản lý GitHub',
        value: 'github',
        description: 'Tạo repository, xem tài khoản và quản lý kết nối'
      },
      {
        name: 'Pull code mới',
        value: 'pull',
        description: 'Cập nhật branch hiện tại từ remote'
      },
      {
        name: 'Sửa thời gian commit',
        value: 'edit-time',
        description: 'Chọn commit trong lịch sử và cập nhật ngày giờ'
      },
      {
        name: 'Quét secret',
        value: 'fix',
        description: 'Tìm file nhạy cảm trước khi đẩy code'
      },
      {
        name: 'Thoát',
        value: 'exit',
        description: 'Thoát ứng dụng'
      }
    ]
  });
}

/**
 * Vòng lặp Menu chính (không đệ quy — callback back chỉ trả sentinel)
 */
async function runMainMenuLoop(initialOptions = {}) {
  while (true) {
    const cwd = process.cwd();
    let branch = 'main';
    try {
      branch = getCurrentBranch(cwd);
    } catch {}
    let ghStatus = { authenticated: false };
    try {
      ghStatus = await getCurrentGitHubUser();
    } catch {
      ghStatus = { authenticated: false };
    }

    printDashboardStatus({
      targetDir: cwd,
      currentBranch: branch,
      githubUser: ghStatus.authenticated ? ghStatus.user : null
    });

    let action;
    try {
      action = await promptMainMenu();
    } catch (err) {
      if (isExitPromptError(err)) {
        printCancelled();
        process.exit(0);
      }
      throw err;
    }

    if (action === 'exit') {
      printCancelled();
      process.exit(0);
    }

    try {
      if (action === 'push') {
        const res = await runPushWizard(initialOptions, async () => 'back');
        // 'back' = user muốn về menu → tiếp tục loop; ngược lại push xong thì thoát
        if (res === 'back') continue;
        return;
      }

      if (action === 'github') {
        const ghResult = await runGitHubMenu({ defaultDir: cwd });
        if (ghResult && ghResult.autoPush && ghResult.repoUrl) {
          // Sau khi tạo repo mới, chuyển tiếp thẳng vào luồng push
          const res = await runPushWizard({ ...initialOptions, repo: ghResult.repoUrl }, async () => 'back');
          if (res === 'back') continue;
          return;
        }
      } else if (action === 'pull') {
        await runPullCommand('origin', undefined, { fromMenu: true });
      } else if (action === 'edit-time') {
        await runEditCommitTimeCommand({ fromMenu: true });
      } else if (action === 'fix') {
        await runFixCommand({ fromMenu: true });
      }
    } catch (err) {
      if (isExitPromptError(err)) {
        printCancelled();
        process.exit(0);
      }
      throw err;
    }

    let next;
    try {
      next = await promptContinueOrBack('Hoàn tất! Bạn muốn tiếp tục hay quay lại bảng điều khiển?');
    } catch (err) {
      if (isExitPromptError(err)) {
        printCancelled();
        process.exit(0);
      }
      throw err;
    }
    if (next === 'exit') {
      process.exit(0);
    }
  }
}

async function main(options = {}) {
  printBanner(VERSION);

  if (!checkGitInstalled()) {
    printGitMissing();
    process.exit(1);
  }

  const isInteractive = !options.yes;

  if (isInteractive && isBareInvocation(options)) {
    try {
      await runMainMenuLoop(options);
    } catch (err) {
      if (isExitPromptError(err)) {
        printCancelled();
        process.exit(0);
      }
      throw err;
    }
    return;
  }

  // Chạy trực tiếp push wizard với các options được cung cấp
  try {
    await runPushWizard(options);
  } catch (err) {
    if (isExitPromptError(err)) {
      printCancelled();
      process.exit(0);
    }
    throw err;
  }
}

/* ==========================================================================
   COMMANDER CLI CONFIGURATION
   ========================================================================== */

const program = new Command();
styleCliHelp(program);

program
  .name('git-push-time')
  .description('Bộ công cụ Git & GitHub CLI: Đẩy code siêu tốc, kết nối GitHub tạo repo, chỉnh thời gian commit và bảo vệ secret')
  .version(VERSION)
  .option('-r, --repo <url>', 'Đường dẫn Git repository (URL hoặc để trống để chọn/tạo mới)')
  .option('-d, --date <datetime>', 'Thời gian commit (VD: "2024-01-15 14:30:00", "-2d", "-5h", "now")')
  .option('-m, --message <msg>', 'Thông điệp commit (Commit message)')
  .option('-b, --branch <branch>', 'Tên branch trên remote (Mặc định: main)')
  .option('-C, --dir <path>', 'Thư mục nguồn cần push (Mặc định: thư mục hiện tại)')
  .option('-f, --force', 'Thực hiện push đè (--force)', false)
  .option('-y, --yes', 'Bỏ qua giao diện hỏi, tự động dùng tham số hoặc giá trị mặc định', false)
  .option('--fix', 'Tự động gỡ file secret khỏi stage & thêm .gitignore (an toàn, không xóa file thật)', false)
  .action(async (opts) => {
    await main(opts);
  });

// LỆNH GITHUB
const ghCmd = program
  .command('github')
  .description('Quản lý tài khoản GitHub và tạo repository mới trực tiếp')
  .action(async () => {
    printBanner(VERSION);
    await runGitHubMenu();
  });

ghCmd
  .command('create')
  .description('Tạo repository mới trên GitHub (Public hoặc Private)')
  .option('-C, --dir <path>', 'Thư mục nguồn cần liên kết')
  .action(async (opts) => {
    printBanner(VERSION);
    const res = await promptCreateRepo({ targetDir: opts.dir || process.cwd() });
    if (res.ok && res.repo) {
      console.log(`\n  » Repo URL: ${res.repo.cloneUrl}\n`);
    }
  });

ghCmd
  .command('whoami')
  .description('Xem thông tin tài khoản GitHub đang kết nối')
  .action(async () => {
    printBanner(VERSION);
    await showGitHubStatus();
  });

ghCmd
  .command('repos')
  .description('Liệt kê danh sách repository trên GitHub của bạn')
  .action(async () => {
    printBanner(VERSION);
    await showUserRepos();
  });

ghCmd
  .command('login')
  .description('Đăng nhập tài khoản GitHub bằng OAuth Device Flow hoặc Token')
  .action(async () => {
    printBanner(VERSION);
    await promptGitHubLogin();
  });

ghCmd
  .command('logout')
  .description('Đăng xuất tài khoản GitHub khỏi máy')
  .action(async () => {
    printBanner(VERSION);
    logoutGitHub();
  });

// LỆNH FIX
program
  .command('fix')
  .description('Quét & tự động gỡ file secret khỏi stage, cập nhật .gitignore và làm sạch commit unpushed')
  .option('-C, --dir <path>', 'Thư mục cần quét fix (Mặc định: thư mục hiện tại)')
  .action(async (opts) => {
    printBanner(VERSION);
    await runFixCommand(opts);
  });

// LỆNH PULL
program
  .command('pull [remote] [branch]')
  .description('Cập nhật code từ remote bằng fast-forward --ff-only hoặc --rebase')
  .option('-C, --dir <path>', 'Thư mục repo cần pull (Mặc định: thư mục hiện tại)')
  .action(async (remote, branch, opts) => {
    printBanner(VERSION);
    await runPullCommand(remote || 'origin', branch, opts || {});
  });

// LỆNH EDIT-TIME
program
  .command('edit-time')
  .description('Sửa thời gian của commit lịch sử (Backdate commit hash)')
  .option('-C, --dir <path>', 'Thư mục repo (Mặc định: thư mục hiện tại)')
  .action(async (opts) => {
    printBanner(VERSION);
    await runEditCommitTimeCommand(opts);
  });

program.parse(process.argv);
