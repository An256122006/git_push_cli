# 🚀 Git Push Time / GitHub CLI (`git-push-time`)

Một công cụ Dòng lệnh (CLI) mạnh mẽ và tiện lợi giúp bạn **đẩy dự án lên Git (GitHub, GitLab, Bitbucket,...) cực nhanh** chỉ bằng cách dán URL repo, đồng thời hỗ trợ **tùy chỉnh hoặc lùi thời gian commit/push** (Author Date & Committer Date).

---

## ✨ Tính năng nổi bật

- 🔗 **Đẩy dự án siêu tốc**: Chỉ cần dán URL Git repository, công cụ tự động làm mọi thao tác `git init`, `git remote add/set-url`, `git add .`, `git commit`, `git push`.
- ⏰ **Tùy chỉnh thời gian commit (Git Backdate)**:
  - Lùi ngày/giờ bằng chuỗi ngắn gọn: `-2d` (2 ngày trước), `-5h` (5 giờ trước), `-1w` (1 tuần trước), `-30m` (30 phút trước).
  - Hoặc nhập ngày giờ chuẩn chính xác: `2024-01-15 14:30:00`.
  - Cập nhật cả `GIT_AUTHOR_DATE` và `GIT_COMMITTER_DATE` chuẩn mực.
- 💬 **Chế độ Tương tác (Interactive Prompt)**: Giao diện trực quan đẹp mắt với câu hỏi từng bước.
- ⚡ **Chế độ Lệnh nhanh (Command-line flags)**: Truyền tham số để đẩy code không cần bấm enter chọn lựa.

---

## 📦 Cài đặt từ NPM

### Cách 1: Cài đặt toàn cục (Recommended)
```bash
npm install -g git-push-time
```
Sau khi cài đặt, bạn có thể gọi lệnh `git-push-time`, `githubcli` hoặc `git-custom-push` ở **bất kỳ thư mục dự án nào** trên máy tính!

### Cách 2: Chạy trực tiếp qua `npx`
```bash
npx git-push-time
```

---

## 🛠️ Hướng dẫn sử dụng

### 1. Chế độ tương tác (Interactive Mode)
Chỉ cần mở Terminal tại thư mục dự án của bạn và gõ:
```bash
git-push-time
```
Công cụ sẽ hiển thị từng câu hỏi giao diện để bạn dán link repo, nhập commit message và chọn thời gian:
1. **Dán Link Repo**: `https://github.com/username/repository.git`
2. **Commit Message**: `Initial commit`
3. **Chọn thời gian**:
   - ⏰ *Ngay bây giờ*
   - ⏳ *Lùi thời gian* (VD: `-2d` là 2 ngày trước)
   - 📅 *Nhập ngày giờ cụ thể* (VD: `2024-05-20 09:15:00`)
4. **Tên Branch**: `main`
5. **Xác nhận**: Có / Không.

---

### 2. Chế độ dòng lệnh nhanh (Command Line Flags)
Đẩy dự án với thông số truyền trực tiếp:

#### Ví dụ 1: Lùi thời gian commit 2 ngày trước
```bash
git-push-time -r https://github.com/username/my-repo.git -d "-2d" -m "Initial commit"
```

#### Ví dụ 2: Đặt ngày giờ commit cụ thể trong quá khứ
```bash
git-push-time -r https://github.com/username/my-repo.git -d "2024-01-15 14:30:00" -m "Add core features"
```

#### Ví dụ 3: Đẩy tự động không hỏi lại (-y) và force push (-f)
```bash
git-push-time -r https://github.com/username/my-repo.git -d "-5h" -m "Update docs" -b main -f -y
```

---

## 📊 Bảng định dạng thời gian hỗ trợ

| Định dạng ví dụ | Ý nghĩa |
| :--- | :--- |
| `now` hoặc để trống | Thời gian hiện tại |
| `-2d` hoặc `2d` | Lùi lại 2 ngày |
| `-5h` hoặc `5h` | Lùi lại 5 giờ |
| `-30m` hoặc `30m` | Lùi lại 30 phút |
| `-1w` hoặc `1w` | Lùi lại 1 tuần |
| `-3m` | Lùi lại 3 tháng |
| `2024-01-15 14:30:00` | Ngày 15/01/2024 lúc 14 giờ 30 phút |
| `2024-01-15` | Ngày 15/01/2024 |

---

- `-r, --repo <url>`: Link Git Repository (VD: `https://github.com/user/repo.git`)
- `-d, --date <datetime>`: Thời gian commit (`now`, `-2d`, `2024-01-15 10:30:00`,...)
- `-m, --message <msg>`: Thông điệp commit (Mặc định: `Initial commit`)
- `-b, --branch <branch>`: Tên branch (Mặc định: `main`)
- `-f, --force`: Đẩy đè lên branch remote (`--force`)
- `-y, --yes`: Tự động xác nhận, không hiện prompt chọn
- `--fix`: Tự động gỡ file secret (.env, .npmrc...) khỏi stage và thêm vào `.gitignore`
- `--publish`: Publish package lên npm sau khi push Git thành công
- `-h, --help`: Hướng dẫn trợ giúp

### 🛠️ Lệnh Fix Secret Độc Lập
Nếu phát hiện repo bị dính secret hoặc GitHub Push Protection (GH013) chặn push, bạn có thể chạy ngay lệnh fix:
```bash
git-push-time fix
```
Lệnh sẽ tự động:
1. Quét vùng stage và thư mục làm việc để tìm file cấu hình nhạy cảm (`.env`, `.npmrc`, keys...).
2. Gỡ file khỏi stage và thêm rule an toàn vào `.gitignore`.
3. Kiểm tra các commit chưa push (unpushed) dính secret cũ và hỗ trợ tự động squash thành commit sạch để GitHub cho phép push.

---

## 📜 Giấy phép
MIT License.
