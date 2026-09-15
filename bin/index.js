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
  getCurrentBranch
} from '../lib/git.js';

const program = new Command();

program
  .name('git-push-time')
  .description('Công cụ CLI giúp đẩy dự án lên Git và sửa thời gian commit (Backdate Commit)')
  .version('1.0.0')
  .option('-r, --repo <url>', 'Đường dẫn Git repository (URL)')
  .option('-d, --date <datetime>', 'Thời gian commit (Ví dụ: "2024-01-15 14:30:00", "-2d", "-5h", "now")')
  .option('-m, --message <msg>', 'Thông điệp commit (Commit message)')
  .option('-b, --branch <branch>', 'Tên branch trên remote (Mặc định: main)')
  .option('-f, --force', 'Thực hiện push đè (--force)', false)
  .option('-y, --yes', 'Bỏ qua prompt tương tác, tự động dùng tham số hoặc giá trị mặc định', false);

program.parse(process.argv);
const options = program.opts();

async function run() {
  console.log(chalk.bold.cyan('\n🚀 GIT PUSH & COMMIT TIME SPOOFER 🚀\n'));

  // 1. Kiểm tra Git đã cài đặt chưa
  if (!checkGitInstalled()) {
    console.error(chalk.red('❌ Hệ thống chưa cài đặt Git. Vui lòng cài đặt Git trước khi dùng công cụ này.'));
    process.exit(1);
  }

  let repoUrl = options.repo;
  let commitMsg = options.message;
  let dateInput = options.date;
  let branchName = options.branch || 'main';

  const isInteractive = !options.yes;

  // 2. Chế độ Tương tác (Interactive Prompts) nếu thiếu tham số
  if (isInteractive) {
    // Nhập URL Repo nếu chưa truyền qua CLI
    if (!repoUrl) {
      repoUrl = await input({
        message: 'Dán link Git Repository (Ví dụ: https://github.com/user/repo.git):',
        validate: (value) => {
          if (!value || !value.trim()) return 'Vui lòng nhập đường dẫn repository!';
          if (!isValidGitUrl(value)) return 'Đường dẫn Git URL không đúng định dạng (https/ssh/.git)';
          return true;
        }
      });
    }

    // Nhập Commit Message nếu chưa truyền
    if (!commitMsg) {
      commitMsg = await input({
        message: 'Nhập thông điệp Commit (Commit message):',
        default: 'Initial commit'
      });
    }

    // Chọn cách nhập thời gian Commit nếu chưa truyền
    if (!dateInput) {
      const dateOption = await select({
        message: 'Chọn thời gian cho Commit:',
        choices: [
          { name: '⏰ Ngay bây giờ (Current Time)', value: 'now' },
          { name: '⏳ Lùi thời gian (Ví dụ: -2d là 2 ngày trước, -5h là 5 giờ trước, -1w là 1 tuần trước)', value: 'relative' },
          { name: '📅 Nhập ngày giờ cụ thể (Ví dụ: 2024-01-15 14:30:00)', value: 'custom' }
        ]
      });

      if (dateOption === 'now') {
        dateInput = 'now';
      } else if (dateOption === 'relative') {
        dateInput = await input({
          message: 'Nhập thời gian lùi (VD: -2d [2 ngày trước], -5h [5 giờ trước], -1w [1 tuần trước]):',
          default: '-1d',
          validate: (val) => {
            const parsed = parseCustomDate(val);
            return parsed.valid || parsed.error || 'Thời gian không hợp lệ';
          }
        });
      } else if (dateOption === 'custom') {
        dateInput = await input({
          message: 'Nhập ngày giờ cụ thể (Định dạng: YYYY-MM-DD HH:mm:ss):',
          default: '2024-01-15 10:00:00',
          validate: (val) => {
            const parsed = parseCustomDate(val);
            return parsed.valid || parsed.error || 'Ngày giờ không hợp lệ';
          }
        });
      }
    }

    // Nhập Branch Name nếu chưa truyền và chưa đổi
    if (!options.branch) {
      const currentB = getCurrentBranch();
      branchName = await input({
        message: 'Tên branch trên remote:',
        default: currentB || 'main'
      });
    }
  }

  // Set default fallback values
  if (!commitMsg) commitMsg = 'Initial commit';
  if (!dateInput) dateInput = 'now';
  if (!branchName) branchName = 'main';

  // Validate Git URL
  if (!repoUrl || !isValidGitUrl(repoUrl)) {
    console.error(chalk.red(`❌ Lỗi: URL repository '${repoUrl}' không hợp lệ!`));
    console.log(chalk.yellow('Ví dụ URL đúng: https://github.com/username/repository.git'));
    process.exit(1);
  }

  // Parse Date/Time
  const parsedDate = parseCustomDate(dateInput);
  if (!parsedDate.valid) {
    console.error(chalk.red(`❌ Lỗi: ${parsedDate.error}`));
    process.exit(1);
  }

  // Hiển thị tóm tắt thông tin trước khi thực thi
  console.log('\n' + chalk.bgBlue.white.bold(' 📋 THÔNG TIN ĐẨY DỰ ÁN '));
  console.log(chalk.gray('----------------------------------------'));
  console.log(`🔗 Repo Remote : ${chalk.green(repoUrl)}`);
  console.log(`💬 Commit Msg  : ${chalk.yellow(commitMsg)}`);
  console.log(`📅 Commit Time : ${chalk.magenta(parsedDate.display)}`);
  console.log(`🌿 Branch      : ${chalk.cyan(branchName)}`);
  console.log(`⚡ Force Push  : ${options.force ? chalk.red('CÓ (--force)') : chalk.gray('Không')}`);
  console.log(chalk.gray('----------------------------------------\n'));

  if (isInteractive) {
    const ok = await confirm({
      message: 'Xác nhận thực hiện tạo commit và đẩy lên Git?',
      default: true
    });
    if (!ok) {
      console.log(chalk.yellow('Đã hủy thao tác.'));
      process.exit(0);
    }
  }

  // 3. Thực thi các bước đẩy dự án
  const spinner = ora();

  try {
    // Bước 1: Git Init
    if (!isGitRepo()) {
      spinner.start('Đang khởi tạo kho chứa Git (git init)...');
      initGitRepo();
      spinner.succeed('Đã khởi tạo kho chứa Git cục bộ.');
    } else {
      spinner.info('Đã phát hiện kho chứa Git có sẵn.');
    }

    // Bước 2: Thiết lập Remote URL
    spinner.start(`Đang cấu hình Remote Origin: ${repoUrl}`);
    setGitRemote(repoUrl);
    spinner.succeed(`Đã cấu hình Remote Origin thành công.`);

    // Bước 3: Stage files (git add .)
    spinner.start('Đang thêm tất cả các file (git add .)...');
    stageAllFiles();
    spinner.succeed('Đã stage tất cả các file.');

    // Bước 4: Commit với thời gian giả lập (Backdate Commit)
    spinner.start(`Đang tạo Commit với thời gian [${parsedDate.display}]...`);
    
    if (!hasChangesToCommit()) {
      spinner.info('Không có thay đổi nào mới để commit. Sẽ tiến hành đẩy commit hiện có.');
    } else {
      commitWithCustomDate(commitMsg, parsedDate.formatted);
      spinner.succeed(`Đã tạo commit thành công với thời gian: ${chalk.bold(parsedDate.display)}`);
    }

    // Bước 5: Đặt tên branch
    spinner.start(`Đang thiết lập branch chính '${branchName}'...`);
    setBranchName(branchName);
    spinner.succeed(`Đã đặt tên branch: ${branchName}`);

    // Bước 6: Push lên Remote
    spinner.start(`Đang đẩy code lên remote '${repoUrl}' (branch: ${branchName})...`);
    pushToRemote(branchName, options.force);
    spinner.succeed(chalk.bold.green(`🎉 ĐÃ ĐẨY DỰ ÁN LÊN GIT THÀNH CÔNG!`));

    console.log('\n' + chalk.bold.green('✨ Hoàn tất! Bạn có thể kiểm tra commit log trên GitHub/GitLab của mình.'));
  } catch (error) {
    spinner.fail(chalk.red('Đã xảy ra lỗi trong quá trình thực thi:'));
    console.error(chalk.red(`\nLỗi: ${error.message}\n`));
    process.exit(1);
  }
}

run();
